'use strict'

// Regression test for https://github.com/fastify/fastify-compress/issues/191
//
// When a client sends a compressed request body and includes a Content-Length
// header reflecting the *compressed* byte size, Fastify's body parser would
// compare that compressed size against the decompressed body size and raise
// FST_ERR_CTP_INVALID_CONTENT_LENGTH.
//
// The fix: delete the Content-Length header inside the preParsing decompression
// hook so Fastify skips the size check entirely.

const { test, describe } = require('node:test')
const zlib = require('node:zlib')
const http = require('node:http')
const Fastify = require('fastify')
const compressPlugin = require('../..')

// Makes a real HTTP POST request with a pre-compressed body and an explicit
// Content-Length set to the *compressed* byte size (as real clients do).
function postCompressed ({ port, body, encoding }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-encoding': encoding,
          'content-length': String(body.length),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
      }
    )
    req.once('error', reject)
    req.end(body)
  })
}

const payload = JSON.stringify({ name: '@fastify/compress' })

describe('regression issue-191: compressed request with Content-Length set to compressed size', async () => {
  test('should decompress gzip request without FST_ERR_CTP_INVALID_CONTENT_LENGTH', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    t.after(() => fastify.close())
    await fastify.register(compressPlugin)
    fastify.post('/', (request, reply) => { reply.send(request.body.name) })
    await fastify.listen({ port: 0, host: '127.0.0.1' })
    const port = fastify.server.address().port

    const compressed = zlib.gzipSync(payload)
    const response = await postCompressed({ port, body: compressed, encoding: 'gzip' })

    t.assert.equal(response.statusCode, 200)
    t.assert.equal(response.body, '@fastify/compress')
  })

  test('should decompress deflate request without FST_ERR_CTP_INVALID_CONTENT_LENGTH', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    t.after(() => fastify.close())
    await fastify.register(compressPlugin)
    fastify.post('/', (request, reply) => { reply.send(request.body.name) })
    await fastify.listen({ port: 0, host: '127.0.0.1' })
    const port = fastify.server.address().port

    const compressed = zlib.deflateSync(payload)
    const response = await postCompressed({ port, body: compressed, encoding: 'deflate' })

    t.assert.equal(response.statusCode, 200)
    t.assert.equal(response.body, '@fastify/compress')
  })

  test('should decompress brotli request without FST_ERR_CTP_INVALID_CONTENT_LENGTH', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    t.after(() => fastify.close())
    await fastify.register(compressPlugin)
    fastify.post('/', (request, reply) => { reply.send(request.body.name) })
    await fastify.listen({ port: 0, host: '127.0.0.1' })
    const port = fastify.server.address().port

    const compressed = zlib.brotliCompressSync(payload)
    const response = await postCompressed({ port, body: compressed, encoding: 'br' })

    t.assert.equal(response.statusCode, 200)
    t.assert.equal(response.body, '@fastify/compress')
  })

  test('should decompress gzip request at route level without FST_ERR_CTP_INVALID_CONTENT_LENGTH', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    t.after(() => fastify.close())
    await fastify.register(compressPlugin, { global: false })
    fastify.post('/', { decompress: {} }, (request, reply) => { reply.send(request.body.name) })
    await fastify.listen({ port: 0, host: '127.0.0.1' })
    const port = fastify.server.address().port

    const compressed = zlib.gzipSync(payload)
    const response = await postCompressed({ port, body: compressed, encoding: 'gzip' })

    t.assert.equal(response.statusCode, 200)
    t.assert.equal(response.body, '@fastify/compress')
  })
})
