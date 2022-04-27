'use strict'

const { test } = require('tap')
const { createReadStream } = require('fs')
const path = require('path')
const zlib = require('zlib')
const pump = require('pump')
const Fastify = require('fastify')
const compressPlugin = require('../index')

function createPayload (compressor) {
  let payload = createReadStream(path.resolve(__dirname, '../package.json'))

  if (compressor) {
    payload = pump(payload, compressor())
  }

  return payload
}

test('It should decompress the request payload :', async (t) => {
  t.test('using brotli algorithm when `Content-Encoding` request header value is set to `br`', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin)

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'br'
      },
      payload: createPayload(zlib.createBrotliCompress)
    })
    t.equal(response.statusCode, 200)
    t.equal(response.body, '@fastify/compress')
  })

  t.test('using deflate algorithm when `Content-Encoding` request header value is set to `deflate`', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin)

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'deflate'
      },
      payload: createPayload(zlib.createDeflate)
    })
    t.equal(response.statusCode, 200)
    t.equal(response.body, '@fastify/compress')
  })

  t.test('using gzip algorithm when `Content-Encoding` request header value is set to `gzip`', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin)

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip'
      },
      payload: createPayload(zlib.createGzip)
    })
    t.equal(response.statusCode, 200)
    t.equal(response.body, '@fastify/compress')
  })

  t.test('using the `forceRequestEncoding` provided algorithm over the `Content-Encoding` request header value', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { forceRequestEncoding: 'gzip' })

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'deflate'
      },
      payload: createPayload(zlib.createGzip)
    })
    t.equal(response.statusCode, 200)
    t.equal(response.body, '@fastify/compress')
  })
})

test('It should not decompress :', async (t) => {
  t.test('when `Content-Encoding` request header is missing', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin)

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      payload: createPayload()
    })
    t.equal(response.statusCode, 200)
    t.equal(response.body, '@fastify/compress')
  })

  t.test('when `Content-Encoding` request header value is set to `identity`', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin)

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'identity'
      },
      payload: createPayload()
    })
    t.equal(response.statusCode, 200)
    t.equal(response.body, '@fastify/compress')
  })
})

test('It should return an error :', async (t) => {
  t.test('when `Content-Encoding` request header value is not supported', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin)

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'whatever'
      },
      payload: createPayload(zlib.createDeflate)
    })
    t.equal(response.statusCode, 415)
    t.strictSame(response.json(), {
      statusCode: 415,
      code: 'FST_CP_ERR_INVALID_CONTENT_ENCODING',
      error: 'Unsupported Media Type',
      message: 'Unsupported Content-Encoding: whatever'
    })
  })

  t.test('when `Content-Encoding` request header value is disabled by the `requestEncodings` option', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { requestEncodings: ['br'] })

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip'
      },
      payload: createPayload(zlib.createDeflate)
    })
    t.equal(response.statusCode, 415)
    t.strictSame(response.json(), {
      statusCode: 415,
      code: 'FST_CP_ERR_INVALID_CONTENT_ENCODING',
      error: 'Unsupported Media Type',
      message: 'Unsupported Content-Encoding: gzip'
    })
  })

  t.test('when the compressed payload is invalid according to `Content-Encoding` request header value', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin)

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'deflate'
      },
      payload: createPayload(zlib.createGzip)
    })
    t.equal(response.statusCode, 400)
    t.strictSame(response.json(), {
      statusCode: 400,
      code: 'FST_CP_ERR_INVALID_CONTENT',
      error: 'Bad Request',
      message: 'Could not decompress the request payload using the provided encoding'
    })
  })
})

test('It should return the error returned by :', async (t) => {
  t.test('`onUnsupportedRequestEncoding`', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      onUnsupportedRequestEncoding (encoding, request) {
        return {
          statusCode: 400,
          code: 'INVALID',
          error: 'Bad Request',
          message: `We don't want to deal with ${encoding}.`
        }
      }
    })

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'whatever'
      },
      payload: createPayload(zlib.createDeflate)
    })
    t.equal(response.statusCode, 400)
    t.strictSame(response.json(), {
      statusCode: 400,
      code: 'INVALID',
      error: 'Bad Request',
      message: 'We don\'t want to deal with whatever.'
    })
  })

  t.test('`onInvalidRequestPayload`', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      onInvalidRequestPayload (encoding, request, error) {
        return {
          statusCode: 400,
          code: 'INVALID',
          error: 'Bad Request',
          message: `What have you sent us? ${encoding} ${error.message}.`
        }
      }
    })

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'deflate'
      },
      payload: createPayload(zlib.createGzip)
    })
    t.equal(response.statusCode, 400)
    t.strictSame(response.json(), {
      statusCode: 400,
      code: 'INVALID',
      error: 'Bad Request',
      message: 'What have you sent us? deflate incorrect header check.'
    })
  })
})

test('It should return the default error :', async (t) => {
  t.test('when `onUnsupportedRequestEncoding` throws', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      onUnsupportedRequestEncoding (encoding, request) {
        throw new Error('Kaboom!')
      }
    })

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'whatever'
      },
      payload: createPayload(zlib.createDeflate)
    })
    t.equal(response.statusCode, 415)
    t.strictSame(response.json(), {
      statusCode: 415,
      code: 'FST_CP_ERR_INVALID_CONTENT_ENCODING',
      error: 'Unsupported Media Type',
      message: 'Unsupported Content-Encoding: whatever'
    })
  })

  t.test('when `onInvalidRequestPayload` throws', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      onInvalidRequestPayload (encoding, request, error) {
        throw new Error('Kaboom!')
      }
    })

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'deflate'
      },
      payload: createPayload(zlib.createGzip)
    })
    t.equal(response.statusCode, 400)
    t.strictSame(response.json(), {
      statusCode: 400,
      code: 'FST_CP_ERR_INVALID_CONTENT',
      error: 'Bad Request',
      message: 'Could not decompress the request payload using the provided encoding'
    })
  })
})

test('It should validate `requestEncodings` option', (t) => {
  t.plan(1)

  const fastify = Fastify()
  fastify.register(compressPlugin, { requestEncodings: [] })

  fastify.ready((err) => {
    t.equal(err.message, 'The `requestEncodings` option array must have at least 1 item.')
  })
})

test('It should make sure that at least one encoding value is supported :', async (t) => {
  t.test('when setting `requestEncodings`', (t) => {
    t.plan(1)

    const fastify = Fastify()
    fastify.register(compressPlugin, { requestEncodings: ['whatever'] })

    fastify.ready((err) => {
      t.equal(err.message, 'None of the passed `requestEncodings` were supported — request decompression not possible.')
    })
  })

  t.test('when setting `forceRequestEncodings`', (t) => {
    t.plan(1)

    const fastify = Fastify()
    fastify.register(compressPlugin, { forceRequestEncoding: ['whatever'] })

    fastify.ready((err) => {
      t.equal(err.message, 'Unsupported decompression encoding whatever.')
    })
  })
})
