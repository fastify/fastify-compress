'use strict'

const { test } = require('tap')
const { createReadStream } = require('fs')
const path = require('path')
const zlib = require('zlib')
const pump = require('pump')
const Fastify = require('fastify')
const compressPlugin = require('../index')

function createPayload (compresser) {
  let payload = createReadStream(path.resolve(__dirname, '../package.json'))

  if (compresser) {
    payload = pump(payload, compresser())
  }

  return payload
}

test('It should not decompress on missing header', async (t) => {
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
  t.equal(response.body, 'fastify-compress')
})

test('It should skip a identity encoded request payload', async (t) => {
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
  t.equal(response.body, 'fastify-compress')
})

test('It should decompress a deflated request payload', async (t) => {
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
  t.equal(response.body, 'fastify-compress')
})

test('It should decompress a gzipped request payload', async (t) => {
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
  t.equal(response.body, 'fastify-compress')
})

test('It should decompress a brotli compressed request payload', async (t) => {
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
  t.equal(response.body, 'fastify-compress')
})

test('It should decompress a request payload forcing the provided algorithm', async (t) => {
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
  t.equal(response.body, 'fastify-compress')
})

test('It should return an error on unsupported encoding', async (t) => {
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

test('It should return an error on disabled encoding', async (t) => {
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

test('It should return an error on invalid compressed payload', async (t) => {
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

test('It should return the error returned from onUnsupportedRequestEncoding', async (t) => {
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

test('It should return the default error if onUnsupportedRequestEncoding throws', async (t) => {
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

test('It should return the error returned from onInvalidRequestPayload', async (t) => {
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

test('It should return the default error if onInvalidRequestPayload throws', async (t) => {
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

test('It should validate option requestEncodings', (t) => {
  t.plan(1)

  const fastify = Fastify()
  fastify.register(compressPlugin, { requestEncodings: [] })

  fastify.ready(err => {
    t.equal(err.message, 'The `requestEncodings` option array must have at least 1 item.')
  })
})

test('It should make sure at least one encoding is supported', (t) => {
  t.plan(1)

  const fastify = Fastify()
  fastify.register(compressPlugin, { requestEncodings: ['whatever'] })

  fastify.ready(err => {
    t.equal(err.message, 'None of the passed `requestEncodings` were supported — request decompression not possible.')
  })
})

test('It should make sure at least one encoding is supported', (t) => {
  t.plan(1)

  const fastify = Fastify()
  fastify.register(compressPlugin, { forceRequestEncoding: ['whatever'] })

  fastify.ready(err => {
    t.equal(err.message, 'Unsupported decompression encoding whatever.')
  })
})
