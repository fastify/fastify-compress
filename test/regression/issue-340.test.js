'use strict'

const { test, describe } = require('node:test')
const { createReadStream } = require('node:fs')
const { pipeline } = require('node:stream')
const path = require('node:path')
const zlib = require('node:zlib')
const Fastify = require('fastify')
const compressPlugin = require('../..')

// When per-route options are only partially specified, the options they do
// not specify must fall back to the global plugin options, and only then to
// the plugin defaults: route first, global second, default last. Before the
// fix, processing the route options rebuilt every option from its default,
// so e.g. a route that only overrode `onUnsupportedRequestEncoding` silently
// lost the globally configured `onInvalidRequestPayload`.
// See: https://github.com/fastify/fastify-compress/issues/340

function createPayload (compressor) {
  let payload = createReadStream(path.resolve(__dirname, '../../package.json'))

  if (compressor) {
    const compressed = compressor()
    pipeline(payload, compressed, () => {})
    payload = compressed
  }

  return payload
}

function invalidPayloadRequest (url) {
  // A gzip-compressed payload announced as deflate: decompression fails and
  // the configured `onInvalidRequestPayload` hook decides the error.
  return {
    url,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'deflate'
    },
    payload: createPayload(zlib.createGzip)
  }
}

describe('partial route `decompress` options should fall back to the global ones :', async () => {
  test('`onInvalidRequestPayload` is taken from the global options when the route does not define it', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      onInvalidRequestPayload (encoding, _request, error) {
        return {
          statusCode: 400,
          code: 'GLOBAL_INVALID',
          error: 'Bad Request',
          message: `global invalid payload: ${encoding} ${error.message}`
        }
      },
      onUnsupportedRequestEncoding (encoding) {
        return {
          statusCode: 415,
          code: 'GLOBAL_UNSUPPORTED',
          error: 'Unsupported Media Type',
          message: `global unsupported: ${encoding}`
        }
      }
    })

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    fastify.post('/partial', {
      decompress: {
        onUnsupportedRequestEncoding (encoding) {
          return {
            statusCode: 415,
            code: 'ROUTE_UNSUPPORTED',
            error: 'Unsupported Media Type',
            message: `route unsupported: ${encoding}`
          }
        }
      }
    }, (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject(invalidPayloadRequest('/partial'))
    t.assert.equal(response.statusCode, 400)
    t.assert.deepEqual(response.json(), {
      statusCode: 400,
      code: 'GLOBAL_INVALID',
      error: 'Bad Request',
      message: 'global invalid payload: deflate incorrect header check'
    })
  })

  test('a route-defined `onUnsupportedRequestEncoding` still wins over the global one', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      onUnsupportedRequestEncoding (encoding) {
        return {
          statusCode: 415,
          code: 'GLOBAL_UNSUPPORTED',
          error: 'Unsupported Media Type',
          message: `global unsupported: ${encoding}`
        }
      }
    })

    fastify.post('/partial', {
      decompress: {
        onUnsupportedRequestEncoding (encoding) {
          return {
            statusCode: 415,
            code: 'ROUTE_UNSUPPORTED',
            error: 'Unsupported Media Type',
            message: `route unsupported: ${encoding}`
          }
        }
      }
    }, (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/partial',
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
      code: 'ROUTE_UNSUPPORTED',
      error: 'Unsupported Media Type',
      message: 'route unsupported: whatever'
    })
  })

  test('`requestEncodings` is taken from the global options when the route does not define it', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      requestEncodings: ['br'],
      onUnsupportedRequestEncoding (encoding) {
        return {
          statusCode: 415,
          code: 'GLOBAL_UNSUPPORTED',
          error: 'Unsupported Media Type',
          message: `global unsupported: ${encoding}`
        }
      }
    })

    fastify.post('/partial', {
      decompress: {
        onInvalidRequestPayload () {
          return { statusCode: 400, code: 'ROUTE_INVALID', error: 'Bad Request', message: 'route invalid' }
        }
      }
    }, (request, reply) => {
      reply.send(request.body.name)
    })

    // gzip is not in the global `requestEncodings`, so it must be rejected
    // even though the route only overrode `onInvalidRequestPayload`.
    const response = await fastify.inject({
      url: '/partial',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip'
      },
      payload: createPayload(zlib.createGzip)
    })
    t.assert.equal(response.statusCode, 415)
    t.assert.deepEqual(response.json(), {
      statusCode: 415,
      code: 'GLOBAL_UNSUPPORTED',
      error: 'Unsupported Media Type',
      message: 'global unsupported: gzip'
    })
  })

  test('a globally configured custom `zlib` is kept when the route does not provide one', async (t) => {
    t.plan(3)

    let usedCustomGlobal = false
    const customZlibGlobal = { createInflate: () => (usedCustomGlobal = true) && zlib.createInflate() }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { zlib: customZlibGlobal })

    fastify.post('/partial', {
      decompress: {
        onUnsupportedRequestEncoding () {
          return { statusCode: 415, code: 'ROUTE_UNSUPPORTED', error: 'Unsupported Media Type', message: 'route unsupported' }
        }
      }
    }, (request, reply) => {
      reply.send(request.body.name)
    })

    const response = await fastify.inject({
      url: '/partial',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'deflate'
      },
      payload: createPayload(zlib.createDeflate)
    })
    t.assert.equal(usedCustomGlobal, true)
    t.assert.equal(response.statusCode, 200)
    t.assert.equal(response.body, '@fastify/compress')
  })

  test('a globally configured `forceRequestEncoding` applies to a route that does not override it', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      forceRequestEncoding: 'gzip',
      onInvalidRequestPayload (encoding, _request, error) {
        return {
          statusCode: 400,
          code: 'GLOBAL_INVALID',
          error: 'Bad Request',
          message: `global invalid payload: ${encoding} ${error.message}`
        }
      }
    })

    fastify.post('/partial', {
      decompress: {
        onUnsupportedRequestEncoding () {
          return { statusCode: 415, code: 'ROUTE_UNSUPPORTED', error: 'Unsupported Media Type', message: 'route unsupported' }
        }
      }
    }, (request, reply) => {
      reply.send(request.body.name)
    })

    // The deflate payload is decompressed as gzip because of the forced
    // encoding, which fails; the global `onInvalidRequestPayload` must
    // still be the one reporting it.
    const response = await fastify.inject({
      url: '/partial',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'deflate'
      },
      payload: createPayload(zlib.createDeflate)
    })
    t.assert.equal(response.statusCode, 400)
    t.assert.deepEqual(response.json(), {
      statusCode: 400,
      code: 'GLOBAL_INVALID',
      error: 'Bad Request',
      message: 'global invalid payload: gzip incorrect header check'
    })
  })

  test('a globally configured `forceRequestEncoding` is dropped when the route overrides `requestEncodings` without it', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      forceRequestEncoding: 'br'
    })

    fastify.post('/partial', {
      decompress: {
        requestEncodings: ['gzip']
      }
    }, (request, reply) => {
      reply.send(request.body.name)
    })

    // The route opted out of brotli, so the global forced encoding must not
    // be inherited: the request is rejected as an unsupported encoding.
    const response = await fastify.inject({
      url: '/partial',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'br'
      },
      payload: createPayload(zlib.createBrotliCompress)
    })
    t.assert.equal(response.statusCode, 415)
    t.assert.deepEqual(response.json(), {
      statusCode: 415,
      code: 'FST_CP_ERR_INVALID_CONTENT_ENCODING',
      error: 'Unsupported Media Type',
      message: 'Unsupported Content-Encoding: br'
    })
  })
})

describe('partial route `compress` options should fall back to the global ones :', async () => {
  test('`threshold` is taken from the global options when the route does not define it', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      threshold: 5000
    })

    // An empty route compress object must keep the global threshold, so a
    // 2000-byte payload is not compressed.
    fastify.get('/partial', { compress: {} }, (request, reply) => {
      reply.send('a'.repeat(2000))
    })

    const response = await fastify.inject({
      url: '/partial',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers['content-encoding'], undefined)
    t.assert.equal(response.body, 'a'.repeat(2000))
  })

  test('a route-defined `threshold` still wins over the global one', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      threshold: 5000
    })

    fastify.get('/custom', { compress: { threshold: 100 } }, (request, reply) => {
      reply.send('a'.repeat(2000))
    })

    const response = await fastify.inject({
      url: '/custom',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), 'a'.repeat(2000))
  })
})
