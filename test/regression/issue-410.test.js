'use strict'

const { test } = require('node:test')
const { setTimeout: sleep } = require('node:timers/promises')
const net = require('node:net')
const { Writable } = require('node:stream')
const Fastify = require('fastify')
const fastifyCompress = require('../..')

// Node's native stream.pipeline emits ERR_STREAM_PREMATURE_CLOSE whose message
// is 'Premature close' (capital P), unlike the legacy pump/end-of-stream
// message 'premature close'. The onEnd guard must suppress both variants.
// See: https://github.com/fastify/fastify-compress/issues/410

function buildFastify (onErrorLog) {
  return Fastify({
    logger: {
      level: 'error',
      stream: new Writable({
        write (chunk, encoding, callback) {
          onErrorLog(chunk.toString())
          callback()
        }
      })
    }
  })
}

function streamRoute (reply, ReadableCtor) {
  let chunks = 0
  const stream = new ReadableCtor({
    read () {
      if (chunks >= 20) {
        this.push(null)
        return
      }
      setTimeout(() => {
        this.push(JSON.stringify({ id: chunks, data: 'x'.repeat(1000) }) + '\n')
        chunks++
      }, 50)
    }
  })
  reply.type('text/plain')
  return stream
}

async function abortClients (port) {
  // Simulate clients that disconnect before the full response is sent
  for (let i = 0; i < 10; i++) {
    await new Promise((_resolve) => {
      const sock = net.connect(port, '127.0.0.1', () => {
        sock.write('GET /stream HTTP/1.1\r\nHost: localhost\r\nAccept-Encoding: gzip\r\n\r\n')
        // Disconnect after receiving partial response (100ms)
        setTimeout(() => {
          sock.destroy()
          _resolve()
        }, 100)
      })
      sock.on('error', () => _resolve())
    })
  }
}

test('should not log native pipeline "Premature close" (ERR_STREAM_PREMATURE_CLOSE) on client disconnect (global compression)', async (t) => {
  let prematureCloseCount = 0

  const fastify = buildFastify((msg) => {
    if (/premature close/i.test(msg)) {
      prematureCloseCount++
    }
  })

  await fastify.register(fastifyCompress, {
    global: true,
    encodings: ['gzip'],
    threshold: 1024
  })

  fastify.get('/stream', async (_request, reply) => {
    return streamRoute(reply, require('node:stream').Readable)
  })

  await fastify.listen({ port: 0 })
  const port = fastify.server.address().port

  await abortClients(port)

  // Allow pending callbacks to fire
  await sleep(2000)
  await fastify.close()

  t.assert.equal(
    prematureCloseCount,
    0,
    `Expected no premature close errors (any casing), but got ${prematureCloseCount} errors from 10 client disconnects`
  )
})

test('should not log native pipeline "Premature close" (ERR_STREAM_PREMATURE_CLOSE) on client disconnect (reply.compress path)', async (t) => {
  let prematureCloseCount = 0

  const fastify = buildFastify((msg) => {
    if (/premature close/i.test(msg)) {
      prematureCloseCount++
    }
  })

  await fastify.register(fastifyCompress, {
    global: false,
    encodings: ['gzip']
  })

  fastify.get('/stream', async (_request, reply) => {
    return reply.compress(streamRoute(reply, require('node:stream').Readable))
  })

  await fastify.listen({ port: 0 })
  const port = fastify.server.address().port

  await abortClients(port)

  // Allow pending callbacks to fire
  await sleep(2000)
  await fastify.close()

  t.assert.equal(
    prematureCloseCount,
    0,
    `Expected no premature close errors (any casing), but got ${prematureCloseCount} errors from 10 client disconnects`
  )
})

test('should still log errors that are not premature close', async (t) => {
  const errors = []

  const fastify = buildFastify((msg) => {
    if (!/premature close/i.test(msg)) {
      errors.push(msg)
    }
  })

  await fastify.register(fastifyCompress, {
    global: true,
    encodings: ['gzip']
  })

  fastify.get('/error', async () => {
    throw new Error('Test error')
  })

  await fastify.inject({
    method: 'GET',
    url: '/error',
    headers: { 'accept-encoding': 'gzip' }
  })

  await sleep(500)

  t.assert.ok(
    errors.length > 0,
    'Expected actual errors to still be logged'
  )
})
