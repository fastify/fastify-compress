'use strict'

const { test } = require('node:test')
const { setTimeout: sleep } = require('node:timers/promises')
const net = require('node:net')
const { Writable } = require('node:stream')
const Fastify = require('fastify')
const fastifyCompress = require('../..')

test('should not log "premature close" errors on client disconnect (global compression)', async (t) => {
  let prematureCloseCount = 0

  const fastify = Fastify({
    logger: {
      level: 'error',
      stream: new Writable({
        write (chunk, encoding, callback) {
          if (chunk.toString().includes('premature close')) {
            prematureCloseCount++
          }
          callback()
        }
      })
    }
  })

  await fastify.register(fastifyCompress, {
    global: true,
    encodings: ['gzip'],
    threshold: 1024
  })

  // Streaming endpoint that takes time to produce data
  fastify.get('/stream', async (_request, reply) => {
    let chunks = 0
    const stream = new (require('node:stream').Readable)({
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
  })

  await fastify.listen({ port: 0 })
  const port = fastify.server.address().port

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

  // Allow pending callbacks to fire
  await sleep(2000)
  await fastify.close()

  t.assert.equal(
    prematureCloseCount,
    0,
    `Expected no "premature close" errors, but got ${prematureCloseCount} errors from 10 client disconnects`
  )
})

test('should not log "premature close" errors on client disconnect (reply.compress path)', async (t) => {
  let prematureCloseCount = 0

  const fastify = Fastify({
    logger: {
      level: 'error',
      stream: new Writable({
        write (chunk, encoding, callback) {
          if (chunk.toString().includes('premature close')) {
            prematureCloseCount++
          }
          callback()
        }
      })
    }
  })

  await fastify.register(fastifyCompress, {
    global: false,
    encodings: ['gzip']
  })

  // Streaming endpoint using reply.compress
  fastify.get('/stream', async (_request, reply) => {
    let chunks = 0
    const stream = new (require('node:stream').Readable)({
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
    return reply.compress(stream)
  })

  await fastify.listen({ port: 0 })
  const port = fastify.server.address().port

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

  // Allow pending callbacks to fire
  await sleep(2000)
  await fastify.close()

  t.assert.equal(
    prematureCloseCount,
    0,
    `Expected no "premature close" errors, but got ${prematureCloseCount} errors from 10 client disconnects`
  )
})

test('should still log actual errors (not premature close)', async (t) => {
  const errors = []

  const fastify = Fastify({
    logger: {
      level: 'error',
      stream: new Writable({
        write (chunk, encoding, callback) {
          const msg = chunk.toString()
          if (msg.includes('premature close')) {
            // Ignore premature close errors
          } else {
            errors.push(msg)
          }
          callback()
        }
      })
    }
  })

  await fastify.register(fastifyCompress, {
    global: true,
    encodings: ['gzip']
  })

  // Route that throws an error
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
