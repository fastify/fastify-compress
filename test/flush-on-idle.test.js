'use strict'

const { test, describe } = require('node:test')
const { once } = require('node:events')
const { request } = require('node:http')
const { PassThrough } = require('node:stream')
const { setTimeout: sleep } = require('node:timers/promises')
const zlib = require('node:zlib')
const Fastify = require('fastify')
const compressPlugin = require('../index')

const chunkA = '<html><head><title>shell</title></head><body>'
const chunkB = '<div>content resolved later</div></body></html>'

const decompressors = {
  br: zlib.createBrotliDecompress,
  gzip: zlib.createGunzip,
  deflate: zlib.createInflate
}
if (typeof zlib.createZstdDecompress === 'function') {
  decompressors.zstd = zlib.createZstdDecompress
}

// Serve a source stream that the test writes into by hand, like a proxied upstream that
// sends the shell of a page first and the rest of it later on
async function buildServer (t, opts, useCompress) {
  const fastify = Fastify()
  await fastify.register(compressPlugin, { threshold: 0, ...opts })

  const sources = []
  fastify.get('/', (_request, reply) => {
    const source = new PassThrough()
    sources.push(source)
    reply.type('text/html')
    if (useCompress) {
      reply.compress(source)
    } else {
      reply.send(source)
    }
  })

  await fastify.listen({ port: 0, host: '127.0.0.1' })
  t.after(() => fastify.close())

  return { port: fastify.server.address().port, sources }
}

// Request the page and decompress the response incrementally, as a browser would.
// Response headers are only sent along with the first body bytes, so the response is not
// awaited here: the caller decides when it is expected.
function fetchIncrementally (port, encoding) {
  const req = request({ port, host: '127.0.0.1', path: '/', headers: { 'accept-encoding': encoding } })
  req.end()

  let text = ''
  const response = once(req, 'response').then(([res]) => {
    const decompressor = decompressors[encoding]()
    decompressor.on('data', (chunk) => { text += chunk })
    res.pipe(decompressor)
    return { res, ended: once(decompressor, 'end') }
  })

  return { response, text: () => text }
}

async function waitFor (condition, timeout = 2000) {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeout) return false
    await sleep(10)
  }
  return true
}

// Start a request and wait for the route to hand over its source stream
async function openPage (t, opts, encoding, useCompress) {
  const { port, sources } = await buildServer(t, opts, useCompress)
  const client = fetchIncrementally(port, encoding)
  await waitFor(() => sources.length === 1)
  return { client, source: sources[0] }
}

function spyFlushes (flushes) {
  return {
    createGzip: (options) => {
      const stream = zlib.createGzip(options)
      const flush = stream.flush
      stream.flush = function (kind, callback) {
        flushes.push(kind)
        return flush.call(this, kind, callback)
      }
      return stream
    }
  }
}

describe('When `flushOnIdle` is `true` :', async () => {
  for (const encoding of Object.keys(decompressors)) {
    for (const useCompress of [false, true]) {
      const path = useCompress ? '`reply.compress()`' : '`onSend` hook'
      test(`it should flush ${encoding} data written before the source went idle, using ${path}`, async (t) => {
        t.plan(5)
        const { client, source } = await openPage(t, { flushOnIdle: true }, encoding, useCompress)

        source.write(chunkA)
        const { res, ended } = await client.response
        t.assert.equal(res.headers['content-encoding'], encoding)
        // The client must be able to read the shell before the rest of the page exists
        t.assert.ok(await waitFor(() => client.text() === chunkA), 'chunk A received before chunk B was written')

        source.write(chunkB)
        t.assert.ok(await waitFor(() => client.text() === chunkA + chunkB), 'chunk B received before the end')

        source.end()
        await ended
        t.assert.equal(client.text(), chunkA + chunkB)
        t.assert.equal(res.complete, true)
      })
    }
  }

  test('it should flush once per burst of chunks, and not after the end', async (t) => {
    t.plan(3)

    const flushes = []
    const { client, source } = await openPage(t, { flushOnIdle: true, zlib: spyFlushes(flushes) }, 'gzip')

    // A burst of chunks written at once is flushed as a whole
    for (let i = 0; i < 10; i++) {
      source.write(chunkA)
    }
    const { ended } = await client.response
    await waitFor(() => client.text().length === chunkA.length * 10)
    t.assert.deepEqual(flushes, [zlib.constants.Z_SYNC_FLUSH])

    // Chunks written in the same burst as the end of the source are not flushed on their
    // own, ending the stream flushes them anyway
    source.write(chunkB)
    source.end()
    await ended
    await sleep(10)
    t.assert.deepEqual(flushes, [zlib.constants.Z_SYNC_FLUSH])
    t.assert.equal(client.text(), chunkA.repeat(10) + chunkB)
  })

  test('it should not flush a stream destroyed before the source went idle', async (t) => {
    t.plan(2)

    const flushes = []
    const { client, source } = await openPage(t, { flushOnIdle: true, zlib: spyFlushes(flushes) }, 'gzip')

    source.write(chunkA)
    const { ended } = await client.response
    ended.catch(() => {})
    await waitFor(() => client.text() === chunkA)
    t.assert.equal(flushes.length, 1)

    // Destroying the source tears the whole pipeline down, compressor included, before the
    // flush scheduled by the last write runs
    source.write(chunkB)
    source.destroy()
    await sleep(50)
    t.assert.equal(flushes.length, 1)
  })

  test('it should not flush buffered payloads', async (t) => {
    t.plan(3)

    const flushes = []
    for (const useCompress of [false, true]) {
      const fastify = Fastify()
      t.after(() => fastify.close())
      await fastify.register(compressPlugin, { threshold: 0, syncThreshold: 0, flushOnIdle: true, zlib: spyFlushes(flushes) })
      fastify.get('/', (_request, reply) => {
        reply.type('text/plain')
        return useCompress ? reply.compress(chunkA + chunkB) : chunkA + chunkB
      })

      const response = await fastify.inject({ url: '/', headers: { 'accept-encoding': 'gzip' } })
      t.assert.equal(zlib.gunzipSync(response.rawPayload).toString(), chunkA + chunkB)
    }

    await sleep(10)
    t.assert.deepEqual(flushes, [])
  })

  test('it should flush web ReadableStream payloads too', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { threshold: 0, flushOnIdle: true })

    let controller
    fastify.get('/', (_request, reply) => {
      reply.type('text/html')
      return new ReadableStream({ start (c) { controller = c } })
    })
    await fastify.listen({ port: 0, host: '127.0.0.1' })
    t.after(() => fastify.close())

    const client = fetchIncrementally(fastify.server.address().port, 'br')
    await waitFor(() => controller !== undefined)
    controller.enqueue(new TextEncoder().encode(chunkA))
    const { ended } = await client.response
    t.assert.ok(await waitFor(() => client.text() === chunkA), 'chunk A received before the end')
    controller.close()
    await ended
    t.assert.equal(client.text(), chunkA)
  })
})

describe('When `flushOnIdle` is not set :', async () => {
  for (const encoding of ['br', 'gzip']) {
    test(`it should keep buffering ${encoding} data until the end`, async (t) => {
      t.plan(3)
      const { client, source } = await openPage(t, {}, encoding)

      source.write(chunkA)
      // Give the compressor plenty of time to emit chunk A, if it was going to
      await sleep(200)
      t.assert.equal(client.text(), '')

      source.write(chunkB)
      source.end()
      const { res, ended } = await client.response
      t.assert.equal(res.headers['content-encoding'], encoding)
      await ended
      t.assert.equal(client.text(), chunkA + chunkB)
    })
  }
})
