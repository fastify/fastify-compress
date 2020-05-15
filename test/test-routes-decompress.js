'use strict'

const t = require('tap')
const test = t.test
const zlib = require('zlib')
const createReadStream = require('fs').createReadStream
const Fastify = require('fastify')
const compressPlugin = require('../index')
const pump = require('pump')

function createPayload(compresser) {
  let payload = createReadStream(__dirname + '/../package.json')

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
  fastify.register(compressPlugin, {zlib: customZlibGlobal})

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
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.body, 'fastify-compress')
    t.strictEqual(usedCustom, false)
    t.strictEqual(usedCustomGlobal, true)

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
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.body, 'fastify-compress')
      t.strictEqual(usedCustom, true)
      t.strictEqual(usedCustomGlobal, false)
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
  fastify.register(compressPlugin, {zlib: customZlibGlobal})

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
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.body, 'fastify-compress')
    t.strictEqual(usedCustom, false)
    t.strictEqual(usedCustomGlobal, true)

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
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.body, 'fastify-compress')
      t.strictEqual(usedCustom, true)
      t.strictEqual(usedCustomGlobal, false)
    })
  })
})

test('should not decompress if route decompression disabled', t => {
  t.plan(10)
  
  let usedCustomGlobal = false
  let usedCustom = false
  
  const customZlibGlobal = { createGunzip: () => (usedCustomGlobal = true) && zlib.createGunzip() }
  const customZlib = { createGunzip: () => (usedCustom = true) && zlib.createGunzip() }

  const fastify = Fastify()
  fastify.register(compressPlugin, {zlib: customZlibGlobal})

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
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.body, 'fastify-compress')
    t.strictEqual(usedCustom, false)
    t.strictEqual(usedCustomGlobal, true)    

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
      t.strictEqual(res.statusCode, 400)
      t.strictDeepEqual(res.json(), {
        statusCode:400,
        code: 'FST_ERR_CTP_INVALID_CONTENT_LENGTH',
        error: 'Bad Request',
        message: 'Request body size did not match Content-Length'
      })
      t.strictEqual(usedCustom, false)
      t.strictEqual(usedCustomGlobal, false)
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
    t.strictEqual(err.message, 'Unknown value for route decompress configuration')
  })
})