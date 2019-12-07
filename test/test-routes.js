'use strict'

const t = require('tap')
const test = t.test
const zlib = require('zlib')
const fs = require('fs')
const createReadStream = fs.createReadStream
const readFileSync = fs.readFileSync
const Fastify = require('fastify')
const compressPlugin = require('../index')

test('should send a deflated data with custom deflate', t => {
  t.plan(12)
  let usedCustomGlobal = false
  let usedCustom = false
  const customZlibGlobal = { createDeflate: () => (usedCustomGlobal = true) && zlib.createDeflate() }
  const customZlib = { createDeflate: () => (usedCustom = true) && zlib.createDeflate() }

  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, zlib: customZlibGlobal })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.get('/custom', {
    config: {
      compress: {
        zlib: customZlib
      }
    }
  }, (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.headers['content-encoding'], 'deflate')
    t.notOk(res.headers['content-length'], 'no content length')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.inflateSync(res.rawPayload)
    t.strictEqual(payload.toString('utf-8'), file)
    t.strictEqual(usedCustom, false)
    t.strictEqual(usedCustomGlobal, true)

    usedCustom = false
    usedCustomGlobal = false
    fastify.inject({
      url: '/custom',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    }, (err, res) => {
      t.error(err)
      t.strictEqual(res.headers['content-encoding'], 'deflate')
      t.notOk(res.headers['content-length'], 'no content length')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.inflateSync(res.rawPayload)
      t.strictEqual(payload.toString('utf-8'), file)
      t.strictEqual(usedCustom, true)
      t.strictEqual(usedCustomGlobal, false)
    })
  })
})

test('should send a gzipped data with custom zlib', t => {
  t.plan(10)
  let usedCustomGlobal = false
  let usedCustom = false
  const customZlibGlobal = { createGzip: () => (usedCustomGlobal = true) && zlib.createGzip() }
  const customZlib = { createGzip: () => (usedCustom = true) && zlib.createGzip() }
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, zlib: customZlibGlobal })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.get('/custom', {
    config: {
      compress: {
        zlib: customZlib
      }
    }
  }, (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.headers['content-encoding'], 'gzip')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(res.rawPayload)
    t.strictEqual(payload.toString('utf-8'), file)
    t.strictEqual(usedCustom, false)
    t.strictEqual(usedCustomGlobal, true)

    usedCustom = false
    usedCustomGlobal = false
    fastify.inject({
      url: '/custom',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    }, (err, res) => {
      t.error(err)
      t.strictEqual(res.headers['content-encoding'], 'gzip')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.gunzipSync(res.rawPayload)
      t.strictEqual(payload.toString('utf-8'), file)
      t.strictEqual(usedCustom, true)
      t.strictEqual(usedCustomGlobal, false)
    })
  })
})
