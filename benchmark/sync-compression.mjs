// Measures the synchronous compression path (`syncThreshold`) against the stream
// pipeline it replaces for small buffered payloads.
//
//   node benchmark/sync-compression.mjs
//   node benchmark/sync-compression.mjs --conns 100 --reps 5 --duration 8000
//
// Both configurations run against the same build: the baseline registers the plugin
// with `syncThreshold: 0`, which always streams, and the candidate uses the default.
//
// A few things this harness deliberately does, because getting any of them wrong
// produces numbers that look meaningful but are not:
//
//   * The server runs in a forked process. Compressing synchronously occupies the
//     event loop, so a client sharing that loop would measure itself as much as
//     the server.
//   * Requests go over real sockets with real concurrency. `inject()` has neither,
//     and cannot observe that the stream path hands work to the libuv threadpool
//     and so overlaps with other cores.
//   * Every size is measured several times, alternating between the two
//     configurations, and reported as a median with its spread.
//   * A control payload larger than the threshold is always included. Both
//     configurations stream it, so its result must come out near zero. When it
//     does not, the machine was too noisy and the whole run is rejected.

import { fork } from 'node:child_process'
import { createRequire } from 'node:module'
import { availableParallelism, loadavg } from 'node:os'
import { gzipSync } from 'node:zlib'
import http from 'node:http'
import { performance } from 'node:perf_hooks'

const require = createRequire(import.meta.url)

// Payload sizes must straddle the threshold: the last one is the control.
const CONTROL_SIZE = 131072
const DEFAULT_SIZES = [1024, 2048, 4096, 8192, CONTROL_SIZE]
// Above this, the control row is too far off for the run to mean anything.
const CONTROL_TOLERANCE = 0.1
const TARGET_RATIO = 8

function parseArgs (argv) {
  const args = {
    conns: 50,
    duration: 5000,
    reps: 3,
    warmup: 1000,
    sizes: DEFAULT_SIZES
  }
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '')
    const value = argv[i + 1]
    if (!(key in args)) throw new Error(`Unknown option: ${argv[i]}`)
    args[key] = key === 'sizes'
      ? value.split(',').map(Number)
      : Number(value)
  }
  return args
}

// Deterministic payload with a realistic compression ratio. Content structure drives
// compression cost far more than length does, so a fixed ratio keeps sizes comparable.
function makePayload (byteCount, randomFraction) {
  const data = Buffer.alloc(byteCount)
  let state = 0x12345678
  for (let i = 0; i < byteCount; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    if (state / 0x100000000 < randomFraction) data[i] = state >>> 24
  }
  return data
}

function makePayloadAtRatio (byteCount, ratio) {
  let low = 0
  let high = 1
  let best
  for (let i = 0; i < 20; i++) {
    const fraction = (low + high) / 2
    const payload = makePayload(byteCount, fraction)
    const actual = byteCount / gzipSync(payload).byteLength
    if (!best || Math.abs(actual - ratio) < Math.abs(best.ratio - ratio)) {
      best = { payload, ratio: actual }
    }
    if (actual > ratio) low = fraction
    else high = fraction
  }
  return best
}

/* ------------------------------------------------------------------ server role */

if (process.env.BENCHMARK_ROLE === 'server') {
  const Fastify = require('fastify')
  const compress = require('../index.js')

  const size = Number(process.env.BENCHMARK_SIZE)
  const syncThreshold = process.env.BENCHMARK_SYNC_THRESHOLD === 'default'
    ? undefined
    : Number(process.env.BENCHMARK_SYNC_THRESHOLD)

  const { payload } = makePayloadAtRatio(size, TARGET_RATIO)
  const body = payload.toString('latin1')

  const app = Fastify()
  const options = { global: true }
  if (syncThreshold !== undefined) options.syncThreshold = syncThreshold
  await app.register(compress, options)

  app.get('/payload', async (_request, reply) => {
    reply.type('text/plain')
    return body
  })

  const address = await app.listen({ port: 0, host: '127.0.0.1' })
  const port = Number(new URL(address).port)

  process.on('message', (message) => {
    if (message === 'rss') process.send({ rssMiB: process.memoryUsage().rss / 1048576 })
  })
  process.send({ ready: true, port })
} else {
  await main()
}

/* ------------------------------------------------------------------ client role */

function startServer (size, syncThreshold) {
  return new Promise((resolve, reject) => {
    const child = fork(import.meta.filename, [], {
      env: {
        ...process.env,
        BENCHMARK_ROLE: 'server',
        BENCHMARK_SIZE: String(size),
        BENCHMARK_SYNC_THRESHOLD: String(syncThreshold)
      },
      stdio: ['ignore', 'ignore', 'inherit', 'ipc']
    })
    const onMessage = (message) => {
      if (message.ready) {
        child.off('message', onMessage)
        resolve({ child, port: message.port })
      }
    }
    child.on('message', onMessage)
    child.once('error', reject)
    child.once('exit', (code) => reject(new Error(`benchmark server exited early (${code})`)))
  })
}

function rssOf (child) {
  return new Promise((resolve) => {
    const onMessage = (message) => {
      if (message.rssMiB !== undefined) {
        child.off('message', onMessage)
        resolve(message.rssMiB)
      }
    }
    child.on('message', onMessage)
    child.send('rss')
  })
}

function get (port, agent) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { host: '127.0.0.1', port, path: '/payload', agent, headers: { 'accept-encoding': 'gzip' } },
      (response) => {
        response.resume()
        response.once('end', () => resolve(response.headers['content-encoding']))
        response.once('error', reject)
      }
    )
    request.once('error', reject)
  })
}

async function measure (port, { conns, duration, warmup }) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: conns })
  const countFrom = performance.now() + warmup
  const stopAt = countFrom + duration
  let completed = 0
  let encoding

  // Requests keep flowing across the warmup boundary, so the measured window sees a
  // server already at steady state rather than one still filling its connection pool.
  const workers = Array.from({ length: conns }, async () => {
    while (performance.now() < stopAt) {
      encoding = await get(port, agent)
      if (performance.now() >= countFrom) completed++
    }
  })

  await Promise.all(workers)
  agent.destroy()

  return { reqPerSec: completed / (duration / 1000), encoding }
}

async function runCase (size, syncThreshold, args) {
  const { child, port } = await startServer(size, syncThreshold)
  try {
    const result = await measure(port, args)
    return { ...result, rssMiB: await rssOf(child) }
  } finally {
    child.kill('SIGKILL')
  }
}

// Declared as a function so it is hoisted above the top-level `main()` call.
function median (values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function formatSize (bytes) {
  return bytes >= 1024 ? `${bytes / 1024} KiB` : `${bytes} B`
}

async function main () {
  const args = parseArgs(process.argv.slice(2))
  const { computeSyncThreshold } = require('../lib/utils.js')
  const cores = availableParallelism()
  const computed = computeSyncThreshold()

  console.log('@fastify/compress — synchronous compression path')
  console.log(`node ${process.version}  ${process.platform}/${process.arch}  ${cores} cores`)
  console.log(`computed default syncThreshold: ${computed} bytes`)
  console.log(`${args.conns} connections, ${args.duration} ms x ${args.reps} reps, target ratio ${TARGET_RATIO}:1\n`)

  const load = loadavg()[0]
  if (load > cores / 4) {
    console.log(`WARNING: 1-minute load average is ${load.toFixed(2)} on ${cores} cores.`)
    console.log('Results from a busy machine are not meaningful. Wait for it to settle.\n')
  }

  const results = new Map(args.sizes.map((size) => [size, { baseline: [], candidate: [] }]))

  for (let rep = 1; rep <= args.reps; rep++) {
    for (const size of args.sizes) {
      // Alternate within a rep so slow drift hits both configurations equally.
      const baseline = await runCase(size, 0, args)
      const candidate = await runCase(size, 'default', args)
      if (baseline.encoding !== 'gzip' || candidate.encoding !== 'gzip') {
        throw new Error(`payload of ${size} B was not compressed — check the plugin threshold`)
      }
      results.get(size).baseline.push(baseline)
      results.get(size).candidate.push(candidate)
    }
    console.log(`rep ${rep}/${args.reps} done`)
  }

  console.log('\npayload      streamed r/s   default r/s     change   streamed RSS   default RSS')
  let controlChange = 0
  for (const size of args.sizes) {
    const { baseline, candidate } = results.get(size)
    const base = median(baseline.map((r) => r.reqPerSec))
    const cand = median(candidate.map((r) => r.reqPerSec))
    const change = cand / base - 1
    const isControl = size > Math.max(computed, ...args.sizes.filter((s) => s <= computed))
    if (isControl) controlChange = Math.max(controlChange, Math.abs(change))
    console.log(
      formatSize(size).padEnd(12) +
      base.toFixed(0).padStart(12) +
      cand.toFixed(0).padStart(14) +
      `${(change * 100).toFixed(0)}%`.padStart(11) +
      `${median(baseline.map((r) => r.rssMiB)).toFixed(0)} MiB`.padStart(15) +
      `${median(candidate.map((r) => r.rssMiB)).toFixed(0)} MiB`.padStart(14) +
      (isControl ? '   <- control, expect ~0%' : '')
    )
  }

  // The control streams in both configurations, so anything other than a near-zero
  // result means the measurement environment, not the plugin, moved the numbers.
  console.log('')
  if (controlChange > CONTROL_TOLERANCE) {
    console.log(`REJECTED: control moved by ${(controlChange * 100).toFixed(0)}%, above the ${CONTROL_TOLERANCE * 100}% tolerance.`)
    console.log('Both configurations stream that payload, so the difference is machine noise.')
    console.log('Re-run on an idle machine, or raise --reps, before drawing conclusions.')
    process.exitCode = 1
  } else {
    console.log(`Control within ${(CONTROL_TOLERANCE * 100).toFixed(0)}% — run looks valid.`)
  }
}
