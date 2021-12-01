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

test('When using routes `decompress` settings :', async (t) => {
  t.test('It should decompress data using the route specific custom provided `createInflate` method', (t) => {
    t.plan(10)

    let usedCustomGlobal = false
    let usedCustom = false
    const customZlibGlobal = { createInflate: () => (usedCustomGlobal = true) && zlib.createInflate() }
    const customZlib = { createInflate: () => (usedCustom = true) && zlib.createInflate() }

    const fastify = Fastify()
    fastify.register(compressPlugin, { zlib: customZlibGlobal })

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

    fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'deflate'
      },
      payload: createPayload(zlib.createDeflate)
    }, (err, response) => {
      t.error(err)

      t.equal(usedCustom, false)
      t.equal(usedCustomGlobal, true)

      t.equal(response.statusCode, 200)
      t.equal(response.body, 'fastify-compress')

      usedCustom = false
      usedCustomGlobal = false
      fastify.inject({
        url: '/custom',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'deflate'
        },
        payload: createPayload(zlib.createDeflate)
      }, (err, response) => {
        t.error(err)

        t.equal(usedCustom, true)
        t.equal(usedCustomGlobal, false)

        t.equal(response.statusCode, 200)
        t.equal(response.body, 'fastify-compress')
      })
    })
  })

  t.test('It should decompress data with the route specific custom provided `createGunzip` method', (t) => {
    t.plan(10)

    let usedCustomGlobal = false
    let usedCustom = false
    const customZlibGlobal = { createGunzip: () => (usedCustomGlobal = true) && zlib.createGunzip() }
    const customZlib = { createGunzip: () => (usedCustom = true) && zlib.createGunzip() }

    const fastify = Fastify()
    fastify.register(compressPlugin, { zlib: customZlibGlobal })

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

    fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip'
      },
      payload: createPayload(zlib.createGzip)
    }, (err, response) => {
      t.error(err)

      t.equal(usedCustom, false)
      t.equal(usedCustomGlobal, true)

      t.equal(response.statusCode, 200)
      t.equal(response.body, 'fastify-compress')

      usedCustom = false
      usedCustomGlobal = false
      fastify.inject({
        url: '/custom',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip'
        },
        payload: createPayload(zlib.createGzip)
      }, (err, response) => {
        t.error(err)

        t.equal(usedCustom, true)
        t.equal(usedCustomGlobal, false)

        t.equal(response.statusCode, 200)
        t.equal(response.body, 'fastify-compress')
      })
    })
  })

  t.test('It should not decompress data when route `decompress` option is set to `false`', (t) => {
    t.plan(8)

    let usedCustomGlobal = false
    const customZlibGlobal = { createGunzip: () => (usedCustomGlobal = true) && zlib.createGunzip() }

    const fastify = Fastify()
    fastify.register(compressPlugin, { zlib: customZlibGlobal })

    fastify.post('/', (request, reply) => {
      reply.send(request.body.name)
    })

    fastify.post('/custom', { decompress: false }, (request, reply) => {
      reply.send(request.body.name)
    })

    fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip'
      },
      payload: createPayload(zlib.createGzip)
    }, (err, response) => {
      t.error(err)

      t.equal(usedCustomGlobal, true)

      t.equal(response.statusCode, 200)
      t.equal(response.body, 'fastify-compress')

      usedCustomGlobal = false
      fastify.inject({
        url: '/custom',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip'
        },
        payload: createPayload(zlib.createGzip)
      }, (err, response) => {
        t.error(err)

        t.equal(usedCustomGlobal, false)

        t.equal(response.statusCode, 400)
        t.strictSame(response.json(), {
          statusCode: 400,
          code: 'FST_ERR_CTP_INVALID_CONTENT_LENGTH',
          error: 'Bad Request',
          message: 'Request body size did not match Content-Length'
        })
      })
    })
  })

  t.test('It should throw an error on invalid route `decompress` settings', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false })

    fastify.post('/', { decompress: 'bad config' }, (request, reply) => {
      reply.send(request.body.name)
    })

    await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-encoding': 'gzip'
      },
      payload: ''
    }).catch((err) => {
      t.type(err, Error)
      t.equal(err.message, 'Unknown value for route decompress configuration')
    })
  })
})

test('When using the old routes `{ config: decompress }` option :', async (t) => {
  t.test('It should decompress data with the route specific custom provided `createGunzip` method', (t) => {
    t.plan(10)

    let usedCustomGlobal = false
    let usedCustom = false
    const customZlibGlobal = { createGunzip: () => (usedCustomGlobal = true) && zlib.createGunzip() }
    const customZlib = { createGunzip: () => (usedCustom = true) && zlib.createGunzip() }

    const fastify = Fastify()
    fastify.register(compressPlugin, { zlib: customZlibGlobal })

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

    fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip'
      },
      payload: createPayload(zlib.createGzip)
    }, (err, response) => {
      t.error(err)

      t.equal(usedCustom, false)
      t.equal(usedCustomGlobal, true)

      t.equal(response.statusCode, 200)
      t.equal(response.body, 'fastify-compress')

      usedCustom = false
      usedCustomGlobal = false
      fastify.inject({
        url: '/custom',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-encoding': 'gzip'
        },
        payload: createPayload(zlib.createGzip)
      }, (err, response) => {
        t.error(err)

        t.equal(usedCustom, true)
        t.equal(usedCustomGlobal, false)

        t.equal(response.statusCode, 200)
        t.equal(response.body, 'fastify-compress')
      })
    })
  })

  t.test('It should use the old routes `{ config: decompress }` options over routes `decompress` options', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false })

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

    await fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-encoding': 'gzip'
      },
      payload: ''
    }).catch((err) => {
      t.type(err, Error)
      t.equal(err.message, 'Unknown value for route decompress configuration')
    })
  })
})
