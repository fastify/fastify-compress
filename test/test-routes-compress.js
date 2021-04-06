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
    t.equal(res.headers['content-encoding'], 'deflate')
    t.notOk(res.headers['content-length'], 'no content length')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.inflateSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), file)
    t.equal(usedCustom, false)
    t.equal(usedCustomGlobal, true)

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
      t.equal(res.headers['content-encoding'], 'deflate')
      t.notOk(res.headers['content-length'], 'no content length')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.inflateSync(res.rawPayload)
      t.equal(payload.toString('utf-8'), file)
      t.equal(usedCustom, true)
      t.equal(usedCustomGlobal, false)
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
    t.equal(res.headers['content-encoding'], 'gzip')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), file)
    t.equal(usedCustom, false)
    t.equal(usedCustomGlobal, true)

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
      t.equal(res.headers['content-encoding'], 'gzip')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.gunzipSync(res.rawPayload)
      t.equal(payload.toString('utf-8'), file)
      t.equal(usedCustom, true)
      t.equal(usedCustomGlobal, false)
    })
  })
})

test('should not compress when global is false and compressed route exists', t => {
  t.plan(12)
  let usedCustom = false
  const customZlib = { createGzip: () => (usedCustom = true) && zlib.createGzip() }
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    // compress function should still be available
    t.type(reply.compress, 'function')
    reply.send({ foo: 1 })
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

  fastify.get('/standard', {
    config: {
      compress: {
        threshold: 1
      }
    }
  }, (req, reply) => {
    reply.send({ foo: 1 })
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers['content-encoding'], undefined)
    t.equal(res.rawPayload.toString('utf-8'), JSON.stringify({ foo: 1 }))
    t.equal(usedCustom, false)

    usedCustom = false
    fastify.inject({
      url: '/custom',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    }, (err, res) => {
      t.error(err)
      t.equal(res.headers['content-encoding'], 'gzip')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.gunzipSync(res.rawPayload)
      t.equal(payload.toString('utf-8'), file)
      t.equal(usedCustom, true)

      fastify.inject({
        url: '/standard',
        method: 'GET',
        headers: {
          'accept-encoding': 'gzip'
        }
      }, (err, res) => {
        t.error(err)
        t.equal(res.headers['content-encoding'], 'gzip')
        const payload = zlib.gunzipSync(res.rawPayload)
        t.equal(payload.toString('utf-8'), JSON.stringify({ foo: 1 }))
      })
    })
  })
})

test('should not compress if route compression disabled', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  const content = { message: 'Hello World!' }
  fastify.get('/', {
    config: {
      compress: false
    }
  }, (req, reply) => {
    reply.send(content)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers['content-encoding'], undefined)
    t.equal(res.rawPayload.toString('utf-8'), JSON.stringify(content))
  })
})

test('should throw an error on invalid compression setting', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', {
    config: {
      compress: 'bad config'
    }
  }, (req, reply) => {
    reply.send('')
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  }, (err, res) => {
    t.type(err, Error)
    t.equal(err.message, 'Unknown value for route compress configuration')
  })
})

test('avoid double onSend', t => {
  t.plan(2)

  const server = Fastify()

  server.register(compressPlugin, {
    threshold: 0
  })

  server.register(async function (server) {
    server.get('/', async (req, _) => {
      return { hi: true }
    })
  }, { prefix: '/test' })

  server.inject({
    url: '/test',
    method: 'GET',
    headers: {
      'accept-encoding': 'br'
    }
  }, (err, res) => {
    t.error(err)
    t.same(JSON.parse(zlib.brotliDecompressSync(res.rawPayload)), { hi: true })
  })
})
