'use strict'

const { test, describe } = require('node:test')
const { createReadStream, readFile, readFileSync } = require('node:fs')
const zlib = require('node:zlib')
const Fastify = require('fastify')
const compressPlugin = require('../index')

describe('When using routes `compress` settings :', async () => {
  test('it should compress data using the route custom provided `createDeflate` method', async (t) => {
    t.plan(12)
    const equal = t.assert.equal

    let usedCustomGlobal = false
    let usedCustom = false
    const customZlibGlobal = { createDeflate: () => (usedCustomGlobal = true) && zlib.createDeflate() }
    const customZlib = { createDeflate: () => (usedCustom = true) && zlib.createDeflate() }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, zlib: customZlibGlobal })

    fastify.get('/', (_request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    fastify.get('/custom', {
      compress: { zlib: customZlib }
    }, (_request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    }).then((response) => {
      equal(usedCustom, false)
      equal(usedCustomGlobal, true)

      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.inflateSync(response.rawPayload)
      equal(response.headers.vary, 'accept-encoding')
      equal(response.headers['content-encoding'], 'deflate')
      t.assert.ok(!response.headers['content-length'], 'no content length')
      equal(payload.toString('utf-8'), file)

      usedCustom = false
      usedCustomGlobal = false
    })

    const response = await fastify.inject({
      url: '/custom',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    })
    equal(usedCustom, true)
    equal(usedCustomGlobal, false)

    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.inflateSync(response.rawPayload)
    equal(response.headers.vary, 'accept-encoding')
    equal(response.headers['content-encoding'], 'deflate')
    t.assert.ok(!response.headers['content-length'], 'no content length')
    equal(payload.toString('utf-8'), file)
  })

  test('it should compress data using the route custom provided `createGzip` method', async (t) => {
    t.plan(10)
    const equal = t.assert.equal

    let usedCustomGlobal = false
    let usedCustom = false
    const customZlibGlobal = { createGzip: () => (usedCustomGlobal = true) && zlib.createGzip() }
    const customZlib = { createGzip: () => (usedCustom = true) && zlib.createGzip() }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false, zlib: customZlibGlobal })

    fastify.get('/', (_request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    fastify.get('/custom', { compress: { zlib: customZlib } }, (_request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    }).then((response) => {
      equal(usedCustom, false)
      equal(usedCustomGlobal, true)

      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.gunzipSync(response.rawPayload)
      equal(response.headers.vary, 'accept-encoding')
      equal(response.headers['content-encoding'], 'gzip')
      equal(payload.toString('utf-8'), file)

      usedCustom = false
      usedCustomGlobal = false
    })

    const response = await fastify.inject({
      url: '/custom',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    equal(usedCustom, true)
    equal(usedCustomGlobal, false)

    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(response.rawPayload)
    equal(response.headers.vary, 'accept-encoding')
    equal(response.headers['content-encoding'], 'gzip')
    equal(payload.toString('utf-8'), file)
  })

  test('it should not compress data when `global` is `false` unless `compress` routes settings have been set up', async (t) => {
    t.plan(12)
    const equal = t.assert.equal

    let usedCustom = false
    const customZlib = { createGzip: () => (usedCustom = true) && zlib.createGzip() }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false })

    fastify.get('/', (_request, reply) => {
      // compress function should still be available
      t.assert.ok(typeof reply.compress === 'function')

      reply.send({ foo: 1 })
    })

    fastify.get('/custom', {
      compress: { zlib: customZlib }
    }, (_request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    fastify.get('/standard', {
      compress: { threshold: 1 }
    }, (_request, reply) => {
      reply.send({ foo: 1 })
    })

    await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    }).then((response) => {
      t.assert.equal(usedCustom, false)
      t.assert.ok(!response.headers.vary)
      t.assert.ok(!response.headers['content-encoding'])
      t.assert.equal(response.rawPayload.toString('utf-8'), JSON.stringify({ foo: 1 }))

      usedCustom = false
    })

    await fastify.inject({
      url: '/custom',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    }).then((response) => {
      equal(usedCustom, true)

      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.gunzipSync(response.rawPayload)
      equal(response.headers.vary, 'accept-encoding')
      equal(response.headers['content-encoding'], 'gzip')
      equal(payload.toString('utf-8'), file)
    })

    const response = await fastify.inject({
      url: '/standard',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    const payload = zlib.gunzipSync(response.rawPayload)
    equal(response.headers.vary, 'accept-encoding')
    equal(response.headers['content-encoding'], 'gzip')
    equal(payload.toString('utf-8'), JSON.stringify({ foo: 1 }))
  })

  test('it should not compress data when route `compress` option is set to `false`', async (t) => {
    t.plan(3)
    const equal = t.assert.equal
    const content = { message: 'Hello World!' }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false })

    fastify.get('/', {
      compress: false
    }, (_request, reply) => {
      reply.send(content)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })

    t.assert.ok(!response.headers.vary)
    t.assert.ok(!response.headers['content-encoding'])
    equal(response.rawPayload.toString('utf-8'), JSON.stringify(content))
  })

  test('it should throw an error on invalid route `compress` settings', async (t) => {
    t.plan(1)
    const equal = t.assert.equal

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false })

    try {
      fastify.get('/', {
        compress: 'bad config'
      }, (_request, reply) => {
        reply.send('')
      })
    } catch (err) {
      equal(err.message, 'Unknown value for route compress configuration')
    }
  })
})

describe('When `compress.removeContentLengthHeader` is `false`, it should not remove `Content-Length` header :', async () => {
  test('using `reply.compress()`', async (t) => {
    t.plan(4)
    const equal = t.assert.equal

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', {
      compress: { removeContentLengthHeader: false }
    }, (_request, reply) => {
      readFile('./package.json', 'utf8', (err, data) => {
        if (err) {
          return reply.send(err)
        }

        reply
          .type('text/plain')
          .header('content-length', '' + data.length)
          .compress(data)
      })
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    })
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.inflateSync(response.rawPayload)
    equal(response.headers.vary, 'accept-encoding')
    equal(response.headers['content-encoding'], 'deflate')
    equal(response.headers['content-length'], payload.length.toString())
    equal(payload.toString('utf-8'), file)
  })

  test('using `onSend` hook', async (t) => {
    t.plan(4)
    const equal = t.assert.equal

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', {
      compress: { removeContentLengthHeader: false }
    }, (_request, reply) => {
      readFile('./package.json', 'utf8', (err, data) => {
        if (err) {
          return reply.send(err)
        }

        reply
          .type('text/plain')
          .header('content-length', '' + data.length)
          .send(data)
      })
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    })
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.inflateSync(response.rawPayload)
    equal(response.headers.vary, 'accept-encoding')
    equal(response.headers['content-encoding'], 'deflate')
    equal(response.headers['content-length'], payload.length.toString())
    equal(payload.toString('utf-8'), file)
  })
})

describe('When using the old routes `{ config: compress }` option :', async () => {
  test('it should compress data using the route custom provided `createGzip` method', async (t) => {
    t.plan(10)
    const equal = t.assert.equal

    let usedCustomGlobal = false
    let usedCustom = false
    const customZlibGlobal = { createGzip: () => (usedCustomGlobal = true) && zlib.createGzip() }
    const customZlib = { createGzip: () => (usedCustom = true) && zlib.createGzip() }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false, zlib: customZlibGlobal })

    fastify.get('/', (_request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    fastify.get('/custom', {
      config: {
        compress: { zlib: customZlib }
      }
    }, (_request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    }).then((response) => {
      equal(usedCustom, false)
      equal(usedCustomGlobal, true)

      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.gunzipSync(response.rawPayload)
      equal(response.headers.vary, 'accept-encoding')
      equal(response.headers['content-encoding'], 'gzip')
      equal(payload.toString('utf-8'), file)

      usedCustom = false
      usedCustomGlobal = false
    })

    const response = await fastify.inject({
      url: '/custom',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    equal(usedCustom, true)
    equal(usedCustomGlobal, false)

    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(response.rawPayload)
    equal(response.headers.vary, 'accept-encoding')
    equal(response.headers['content-encoding'], 'gzip')
    equal(payload.toString('utf-8'), file)
  })

  test('it should use the old routes `{ config: compress }` options over routes `compress` options', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false })

    try {
      fastify.get('/', {
        compress: {
          zlib: { createGzip: () => zlib.createGzip() }
        },
        config: {
          compress: 'bad config'
        }
      }, (_request, reply) => {
        reply.send('')
      })
    } catch (err) {
      t.assert.equal(err.message, 'Unknown value for route compress configuration')
    }
  })
})

test('It should avoid to trigger `onSend` hook twice', async (t) => {
  t.plan(1)

  const server = Fastify()
  await server.register(compressPlugin, { threshold: 0 })

  await server.register(async function (server) {
    server.get('/', async () => {
      return { hi: true }
    })
  }, { prefix: '/test' })

  const response = await server.inject({
    url: '/test',
    method: 'GET',
    headers: {
      'accept-encoding': 'br'
    }
  })
  t.assert.deepEqual(JSON.parse(zlib.brotliDecompressSync(response.rawPayload)), { hi: true })
})
