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

describe('When using routes `decompress` settings :', async () => {
  test('it should decompress data using the route custom provided `createInflate` method', async (t) => {
    t.plan(8)
    const equal = t.assert.equal

    let usedCustomGlobal = false
    let usedCustom = false
    const customZlibGlobal = { createInflate: () => (usedCustomGlobal = true) && zlib.createInflate() }
    const customZlib = { createInflate: () => (usedCustom = true) && zlib.createInflate() }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { zlib: customZlibGlobal })

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    fastify.post('/custom', {
      decompress: {
        zlib: customZlib
      }
    }, (request, reply) => {
      reply.send(request.body.name)
    })

    await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'deflate'
      },
      payload: createPayload(zlib.createDeflate)
    }).then((response) => {
      equal(usedCustom, false)
      equal(usedCustomGlobal, true)

      equal(response.statusCode, 200)
      equal(response.body, '@fastify/compress')

      usedCustom = false
      usedCustomGlobal = false
    })
    const response = await fastify.inject({
      url: '/custom',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'deflate'
      },
      payload: createPayload(zlib.createDeflate)
    })
    equal(usedCustom, true)
    equal(usedCustomGlobal, false)

    equal(response.statusCode, 200)
    equal(response.body, '@fastify/compress')
  })

  test('it should decompress data using the route custom provided `createGunzip` method', async (t) => {
    t.plan(8)
    const equal = t.assert.equal

    let usedCustomGlobal = false
    let usedCustom = false
    const customZlibGlobal = { createGunzip: () => (usedCustomGlobal = true) && zlib.createGunzip() }
    const customZlib = { createGunzip: () => (usedCustom = true) && zlib.createGunzip() }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { zlib: customZlibGlobal })

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    fastify.post('/custom', {
      decompress: {
        zlib: customZlib
      }
    }, (request, reply) => {
      reply.send(request.body.name)
    })

    await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip'
      },
      payload: createPayload(zlib.createGzip)
    }).then((response) => {
      equal(usedCustom, false)
      equal(usedCustomGlobal, true)

      equal(response.statusCode, 200)
      equal(response.body, '@fastify/compress')

      usedCustom = false
      usedCustomGlobal = false
    })

    const response = await fastify.inject({
      url: '/custom',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip'
      },
      payload: createPayload(zlib.createGzip)
    })
    equal(usedCustom, true)
    equal(usedCustomGlobal, false)

    equal(response.statusCode, 200)
    equal(response.body, '@fastify/compress')
  })

  test('it should not decompress data when route `decompress` option is set to `false`', async (t) => {
    t.plan(6)
    const equal = t.assert.equal

    let usedCustomGlobal = false
    const customZlibGlobal = { createGunzip: () => (usedCustomGlobal = true) && zlib.createGunzip() }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { zlib: customZlibGlobal })

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    fastify.post('/custom', { decompress: false }, (request, reply) => {
      reply.send(request.body.name)
    })

    await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip'
      },
      payload: createPayload(zlib.createGzip)
    }).then((response) => {
      equal(usedCustomGlobal, true)

      equal(response.statusCode, 200)
      equal(response.body, '@fastify/compress')

      usedCustomGlobal = false
    })

    const response = await fastify.inject({
      url: '/custom',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip'
      },
      payload: createPayload(zlib.createGzip)
    })
    equal(usedCustomGlobal, false)

    equal(response.statusCode, 400)
    t.assert.match(response.json().message, /is not valid JSON/)
  })

  test('it should return FST_ERR_CTP_INVALID_CONTENT_LENGTH when Content-Length mismatches payload', async (t) => {
    t.plan(2)
    const equal = t.assert.equal

    const fastify = Fastify()
    await fastify.register(compressPlugin)

    fastify.post('/length', (request, reply) => {
      reply.send({ ok: true })
    })

    const response = await fastify.inject({
      url: '/length',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '100',
      },
      payload: JSON.stringify({ hello: 'world' })
    })

    equal(response.statusCode, 400)
    t.assert.deepEqual(response.json(), {
      statusCode: 400,
      code: 'FST_ERR_CTP_INVALID_CONTENT_LENGTH',
      error: 'Bad Request',
      message: 'Request body size did not match Content-Length'
    })
  })

  test('it should throw an error on invalid route `decompress` settings', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false })

    try {
      fastify.post('/', { decompress: 'bad config' }, (request, reply) => {
        reply.send(request.body.name)
      })
    } catch (err) {
      t.assert.equal(err.message, 'Unknown value for route decompress configuration')
    }
  })
})

describe('When using the old routes `{ config: decompress }` option :', async () => {
  test('it should decompress data using the route custom provided `createGunzip` method', async (t) => {
    t.plan(8)
    const equal = t.assert.equal

    let usedCustomGlobal = false
    let usedCustom = false
    const customZlibGlobal = { createGunzip: () => (usedCustomGlobal = true) && zlib.createGunzip() }
    const customZlib = { createGunzip: () => (usedCustom = true) && zlib.createGunzip() }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { zlib: customZlibGlobal })

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    fastify.post('/custom', {
      config: {
        decompress: {
          zlib: customZlib
        }
      }
    }, (request, reply) => {
      reply.send(request.body.name)
    })

    await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip'
      },
      payload: createPayload(zlib.createGzip)
    }).then((response) => {
      equal(usedCustom, false)
      equal(usedCustomGlobal, true)

      equal(response.statusCode, 200)
      equal(response.body, '@fastify/compress')

      usedCustom = false
      usedCustomGlobal = false
    })

    const response = await fastify.inject({
      url: '/custom',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip'
      },
      payload: createPayload(zlib.createGzip)
    })
    equal(usedCustom, true)
    equal(usedCustomGlobal, false)

    equal(response.statusCode, 200)
    equal(response.body, '@fastify/compress')
  })

  test('it should use the old routes `{ config: decompress }` options over routes `decompress` options', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false })

    try {
      fastify.post('/', {
        decompress: {
          zlib: { createGunzip: () => zlib.createGunzip() }
        },
        config: {
          decompress: 'bad config'
        }
      }, (request, reply) => {
        reply.send(request.body.name)
      })
    } catch (err) {
      t.assert.equal(err.message, 'Unknown value for route decompress configuration')
    }
  })
})
