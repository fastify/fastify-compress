'use strict'

const { test, describe } = require('node:test')
const { createReadStream } = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
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

describe('It should decompress the request payload :', async () => {
  test('using brotli algorithm when `Content-Encoding` request header value is set to `br`', async (t) => {
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
    t.assert.equal(response.statusCode, 200)
    t.assert.equal(response.body, '@fastify/compress')
  })

  test('using zstd algorithm when `Content-Encoding` request header value is set to `zstd`', async (t) => {
    if (typeof zlib.createZstdCompress !== 'function') {
      t.skip('zstd not supported in this Node.js version')
      return
    }
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
        'content-encoding': 'zstd'
      },
      payload: createPayload(zlib.createZstdCompress)
    })
    t.assert.equal(response.statusCode, 200)
    t.assert.equal(response.body, '@fastify/compress')
  })

  test('using deflate algorithm when `Content-Encoding` request header value is set to `deflate`', async (t) => {
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
    t.assert.equal(response.statusCode, 200)
    t.assert.equal(response.body, '@fastify/compress')
  })

  test('using gzip algorithm when `Content-Encoding` request header value is set to `gzip`', async (t) => {
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
    t.assert.equal(response.statusCode, 200)
    t.assert.equal(response.body, '@fastify/compress')
  })

  test('using the `forceRequestEncoding` provided algorithm over the `Content-Encoding` request header value', async (t) => {
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
    t.assert.equal(response.statusCode, 200)
    t.assert.equal(response.body, '@fastify/compress')
  })
})

describe('It should not decompress :', async () => {
  test('when `Content-Encoding` request header is missing', async (t) => {
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
    t.assert.equal(response.statusCode, 200)
    t.assert.equal(response.body, '@fastify/compress')
  })

  test('when `Content-Encoding` request header value is set to `identity`', async (t) => {
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
    t.assert.equal(response.statusCode, 200)
    t.assert.equal(response.body, '@fastify/compress')
  })
})

describe('It should return an error :', async () => {
  test('when `Content-Encoding` request header value is not supported', async (t) => {
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
    t.assert.equal(response.statusCode, 415)
    t.assert.deepEqual(response.json(), {
      statusCode: 415,
      code: 'FST_CP_ERR_INVALID_CONTENT_ENCODING',
      error: 'Unsupported Media Type',
      message: 'Unsupported Content-Encoding: whatever'
    })
  })

  test('when `Content-Encoding` request header value is disabled by the `requestEncodings` option', async (t) => {
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
    t.assert.equal(response.statusCode, 415)
    t.assert.deepEqual(response.json(), {
      statusCode: 415,
      code: 'FST_CP_ERR_INVALID_CONTENT_ENCODING',
      error: 'Unsupported Media Type',
      message: 'Unsupported Content-Encoding: gzip'
    })
  })

  test('when the compressed payload is invalid according to `Content-Encoding` request header value', async (t) => {
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
    t.assert.equal(response.statusCode, 400)
    t.assert.deepEqual(response.json(), {
      statusCode: 400,
      code: 'FST_CP_ERR_INVALID_CONTENT',
      error: 'Bad Request',
      message: 'Could not decompress the request payload using the provided encoding'
    })
  })
})

describe('It should return the error returned by :', async () => {
  test('`onUnsupportedRequestEncoding`', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      onUnsupportedRequestEncoding (encoding) {
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
    t.assert.equal(response.statusCode, 400)
    t.assert.deepEqual(response.json(), {
      statusCode: 400,
      code: 'INVALID',
      error: 'Bad Request',
      message: 'We don\'t want to deal with whatever.'
    })
  })

  test('`onInvalidRequestPayload`', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      onInvalidRequestPayload (encoding, _request, error) {
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
    t.assert.equal(response.statusCode, 400)
    t.assert.deepEqual(response.json(), {
      statusCode: 400,
      code: 'INVALID',
      error: 'Bad Request',
      message: 'What have you sent us? deflate incorrect header check.'
    })
  })
})

describe('It should return the default error :', async () => {
  test('when `onUnsupportedRequestEncoding` throws', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      onUnsupportedRequestEncoding () {
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
    t.assert.equal(response.statusCode, 415)
    t.assert.deepEqual(response.json(), {
      statusCode: 415,
      code: 'FST_CP_ERR_INVALID_CONTENT_ENCODING',
      error: 'Unsupported Media Type',
      message: 'Unsupported Content-Encoding: whatever'
    })
  })

  test('when `onInvalidRequestPayload` throws', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      onInvalidRequestPayload () {
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
    t.assert.equal(response.statusCode, 400)
    t.assert.deepEqual(response.json(), {
      statusCode: 400,
      code: 'FST_CP_ERR_INVALID_CONTENT',
      error: 'Bad Request',
      message: 'Could not decompress the request payload using the provided encoding'
    })
  })
})

test('It should validate `requestEncodings` option', async (t) => {
  t.plan(1)

  const fastify = Fastify()
  fastify.register(compressPlugin, { requestEncodings: [] })
  t.assert.rejects(
    async () => fastify.ready(),
    {
      name: 'Error',
      message: 'The `requestEncodings` option array must have at least 1 item.'
    }
  )
})

describe('It should make sure that at least one encoding value is supported :', async () => {
  test('when setting `requestEncodings`', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    fastify.register(compressPlugin, { requestEncodings: ['whatever'] })

    t.assert.rejects(
      async () => fastify.ready(),
      {
        name: 'Error',
        message: 'None of the passed `requestEncodings` were supported — request decompression not possible.'
      }
    )
  })

  test('when setting `forceRequestEncodings`', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    fastify.register(compressPlugin, { forceRequestEncoding: ['whatever'] })
    t.assert.rejects(
      async () => fastify.ready(),
      {
        name: 'Error',
        message: 'Unsupported decompression encoding whatever.'
      }
    )
  })
})
