'use strict'

const t = require('tap')
const test = t.test
const path = require('path')
const zlib = require('zlib')
const createReadStream = require('fs').createReadStream
const Fastify = require('fastify')
const compressPlugin = require('../index')
const pump = require('pump')

function createPayload (compresser) {
  let payload = createReadStream(path.resolve(__dirname, '../package.json'))

  if (compresser) {
    payload = pump(payload, compresser())
  }

  return payload
}

test('should decompress a inflated data with custom inflate', t => {
  t.plan(10)

  let usedCustomGlobal = false
  let usedCustom = false

  const customZlibGlobal = { createInflate: () => (usedCustomGlobal = true) && zlib.createInflate() }
  const customZlib = { createInflate: () => (usedCustom = true) && zlib.createInflate() }

  const fastify = Fastify()
  fastify.register(compressPlugin, { zlib: customZlibGlobal })

  fastify.post('/', (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.post('/custom', {
    config: {
      decompress: {
        zlib: customZlib
      }
    }
  }, (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'deflate'
    },
    payload: createPayload(zlib.createDeflate)
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.equal(res.body, 'fastify-compress')
    t.equal(usedCustom, false)
    t.equal(usedCustomGlobal, true)

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
    }, (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(res.body, 'fastify-compress')
      t.equal(usedCustom, true)
      t.equal(usedCustomGlobal, false)
    })
  })
})

test('should decompress a inflated data with custom gzip', t => {
  t.plan(10)

  let usedCustomGlobal = false
  let usedCustom = false

  const customZlibGlobal = { createGunzip: () => (usedCustomGlobal = true) && zlib.createGunzip() }
  const customZlib = { createGunzip: () => (usedCustom = true) && zlib.createGunzip() }

  const fastify = Fastify()
  fastify.register(compressPlugin, { zlib: customZlibGlobal })

  fastify.post('/', (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.post('/custom', {
    config: {
      decompress: {
        zlib: customZlib
      }
    }
  }, (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'gzip'
    },
    payload: createPayload(zlib.createGzip)
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.equal(res.body, 'fastify-compress')
    t.equal(usedCustom, false)
    t.equal(usedCustomGlobal, true)

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
    }, (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(res.body, 'fastify-compress')
      t.equal(usedCustom, true)
      t.equal(usedCustomGlobal, false)
    })
  })
})

test('should not decompress if route decompression disabled', t => {
  t.plan(8)

  let usedCustomGlobal = false

  const customZlibGlobal = { createGunzip: () => (usedCustomGlobal = true) && zlib.createGunzip() }

  const fastify = Fastify()
  fastify.register(compressPlugin, { zlib: customZlibGlobal })

  fastify.post('/', (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.post('/custom', {
    config: {
      decompress: false
    }
  }, (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'gzip'
    },
    payload: createPayload(zlib.createGzip)
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.equal(res.body, 'fastify-compress')
    t.equal(usedCustomGlobal, true)

    usedCustomGlobal = false

    fastify.inject({
      url: '/custom',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip'
      },
      payload: createPayload(zlib.createGzip)
    }, (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 400)
      t.strictSame(res.json(), {
        statusCode: 400,
        code: 'FST_ERR_CTP_INVALID_CONTENT_LENGTH',
        error: 'Bad Request',
        message: 'Request body size did not match Content-Length'
      })
      t.equal(usedCustomGlobal, false)
    })
  })
})

test('should throw an error on invalid decompression setting', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.post('/', {
    config: {
      decompress: 'bad config'
    }
  }, (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-encoding': 'gzip'
    },
    payload: ''
  }, (err, res) => {
    t.type(err, Error)
    t.equal(err.message, 'Unknown value for route decompress configuration')
  })
})
