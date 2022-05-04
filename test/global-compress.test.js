'use strict'

const { test } = require('tap')
const { createReadStream, readFile, readFileSync } = require('fs')
const { Readable, Writable, PassThrough } = require('stream')
const zlib = require('zlib')
const AdmZip = require('adm-zip')
const JSONStream = require('jsonstream')
const Fastify = require('fastify')
const compressPlugin = require('../index')
const { once } = require('events')

test('When `global` is not set, it is `true` by default :', async (t) => {
  t.test('it should compress Buffer data using brotli when `Accept-Encoding` request header is `br`', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { threshold: 0 })

    const buf = Buffer.from('hello world')
    fastify.get('/', (request, reply) => {
      reply.send(buf)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'br'
      }
    })
    const payload = zlib.brotliDecompressSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })

  t.test('it should compress Buffer data using deflate when `Accept-Encoding` request header is `deflate`', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { threshold: 0 })

    const buf = Buffer.from('hello world')
    fastify.get('/', (request, reply) => {
      reply.send(buf)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    })
    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })

  t.test('it should compress Buffer data using gzip when `Accept-Encoding` request header is `gzip`', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { threshold: 0 })

    const buf = Buffer.from('hello world')
    fastify.get('/', (request, reply) => {
      reply.send(buf)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })

  t.test('it should compress JSON data using brotli when `Accept-Encoding` request header is `br`', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { threshold: 0 })

    const json = { hello: 'world' }

    fastify.get('/', (request, reply) => {
      reply.send(json)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'br'
      }
    })
    const payload = zlib.brotliDecompressSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), JSON.stringify(json))
  })

  t.test('it should compress JSON data using deflate when `Accept-Encoding` request header is `deflate`', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { threshold: 0 })

    const json = { hello: 'world' }

    fastify.get('/', (request, reply) => {
      reply.send(json)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    })
    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), JSON.stringify(json))
  })

  t.test('it should compress JSON data using gzip when `Accept-Encoding` request header is `gzip`', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { threshold: 0 })

    const json = { hello: 'world' }
    fastify.get('/', (request, reply) => {
      reply.send(json)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), JSON.stringify(json))
  })

  t.test('it should compress string data using brotli when `Accept-Encoding` request header is `br', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { threshold: 0 })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .send('hello')
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'br'
      }
    })
    const payload = zlib.brotliDecompressSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), 'hello')
  })

  t.test('it should compress string data using deflate when `Accept-Encoding` request header is `deflate', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { threshold: 0 })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress('hello')
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    })
    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), 'hello')
  })

  t.test('it should compress string data using gzip when `Accept-Encoding` request header is `gzip', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { threshold: 0 })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress('hello')
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), 'hello')
  })
})

test('It should send compressed Stream data when `global` is `true` :', async (t) => {
  t.test('using brotli when `Accept-Encoding` request header is `br`', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'br'
      }
    })
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.brotliDecompressSync(response.rawPayload)
    t.equal(response.headers.vary, 'accept-encoding')
    t.equal(response.headers['content-encoding'], 'br')
    t.equal(payload.toString('utf-8'), file)
  })

  t.test('using deflate when `Accept-Encoding` request header is `deflate`', async (t) => {
    t.plan(4)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
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
    t.equal(response.headers['content-encoding'], 'deflate')
    t.equal(response.headers.vary, 'accept-encoding')
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(payload.toString('utf-8'), file)
  })

  t.test('using gzip when `Accept-Encoding` request header is `gzip`', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'gzip')
    t.equal(payload.toString('utf-8'), file)
  })
})

test('It should send compressed Buffer data when `global` is `true` :', async (t) => {
  t.test('using brotli when `Accept-Encoding` request header is `br`', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    const buf = Buffer.from('hello world')
    fastify.get('/', (request, reply) => {
      reply.compress(buf)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'br'
      }
    })
    const payload = zlib.brotliDecompressSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })

  t.test('using deflate when `Accept-Encoding` request header is `deflate`', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    const buf = Buffer.from('hello world')
    fastify.get('/', (request, reply) => {
      reply.compress(buf)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    })
    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })

  t.test('using gzip when `Accept-Encoding` request header is `gzip`', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    const buf = Buffer.from('hello world')
    fastify.get('/', (request, reply) => {
      reply.compress(buf)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })
})

test('It should send compressed JSON data when `global` is `true` :', async (t) => {
  t.test('using brotli when `Accept-Encoding` request header is `br`', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    const json = { hello: 'world' }
    fastify.get('/', (request, reply) => {
      reply.compress(json)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'br'
      }
    })
    const payload = zlib.brotliDecompressSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), JSON.stringify(json))
  })

  t.test('using deflate when `Accept-Encoding` request header is `deflate`', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    const json = { hello: 'world' }
    fastify.get('/', (request, reply) => {
      reply.compress(json)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    })
    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), JSON.stringify(json))
  })

  t.test('using gzip when `Accept-Encoding` request header is `gzip`', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    const json = { hello: 'world' }
    fastify.get('/', (request, reply) => {
      reply.compress(json)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), JSON.stringify(json))
  })
})

test('It should fallback to the default `gzip` encoding compression :', async (t) => {
  t.test('when `Accept-Encoding` request header value is set to `*`', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': '*'
      }
    })
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'gzip')
    t.equal(payload.toString('utf-8'), file)
  })

  t.test('when `Accept-Encoding` request header value is set to multiple `*` directives', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': '*,*'
      }
    })
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'gzip')
    t.equal(payload.toString('utf-8'), file)
  })
})

test('When a custom `zlib` option is provided, it should compress data :`', async (t) => {
  t.test('using the custom `createBrotliCompress()` method', async (t) => {
    t.plan(4)

    let usedCustom = false
    const customZlib = { createBrotliCompress: () => (usedCustom = true) && zlib.createBrotliCompress() }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, zlib: customZlib })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'br'
      }
    })
    t.equal(usedCustom, true)

    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.brotliDecompressSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'br')
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(payload.toString('utf-8'), file)
  })

  t.test('using the custom `createDeflate()` method', async (t) => {
    t.plan(4)

    let usedCustom = false
    const customZlib = { createDeflate: () => (usedCustom = true) && zlib.createDeflate() }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, zlib: customZlib })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    })
    t.equal(usedCustom, true)

    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'deflate')
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(payload.toString('utf-8'), file)
  })

  t.test('using the custom `createGzip()` method', async (t) => {
    t.plan(3)

    let usedCustom = false
    const customZlib = { createGzip: () => (usedCustom = true) && zlib.createGzip() }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, zlib: customZlib })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    t.equal(usedCustom, true)

    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'gzip')
    t.equal(payload.toString('utf-8'), file)
  })
})

test('When a malformed custom `zlib` option is provided, it should compress data :', async (t) => {
  t.test('using the fallback default Node.js core `zlib.createBrotliCompress()` method', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      threshold: 0,
      zlib: true // will trigger a fallback on the default zlib.createBrotliCompress
    })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress('hello')
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'br'
      }
    })
    const payload = zlib.brotliDecompressSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), 'hello')
  })

  t.test('using the fallback default Node.js core `zlib.createDeflate()` method', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      threshold: 0,
      zlib: true // will trigger a fallback on the default zlib.createDeflate
    })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress('hello')
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    })
    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), 'hello')
  })

  t.test('using the fallback default Node.js core `zlib.createGzip()` method', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      threshold: 0,
      zlib: true // will trigger a fallback on the default zlib.createGzip
    })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress('hello')
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), 'hello')
  })
})

test('When `inflateIfDeflated` is `true` and `X-No-Compression` request header is `true` :', async (t) => {
  t.test('it should uncompress payloads using the deflate algorithm', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { threshold: 0, inflateIfDeflated: true })

    const json = { hello: 'world' }
    fastify.get('/', (request, reply) => {
      reply.send(zlib.deflateSync(JSON.stringify(json)))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'x-no-compression': true
      }
    })
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-encoding'])
    t.same(JSON.parse('' + response.payload), json)
  })

  t.test('it should uncompress payloads using the gzip algorithm', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { threshold: 0, inflateIfDeflated: true })

    const json = { hello: 'world' }
    fastify.get('/', (request, reply) => {
      reply.send(zlib.gzipSync(JSON.stringify(json)))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'x-no-compression': true
      }
    })
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-encoding'])
    t.same(JSON.parse('' + response.payload), json)
  })
})

test('it should not uncompress payloads using the zip algorithm', async (t) => {
  t.plan(4)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { threshold: 0, inflateIfDeflated: true })

  const json = { hello: 'world' }
  const zip = new AdmZip()
  zip.addFile('file.zip', Buffer.from(JSON.stringify(json), 'utf-8'))
  const fileBuffer = zip.toBuffer()

  fastify.get('/', (request, reply) => {
    reply.compress(fileBuffer)
  })

  const response = await fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'x-no-compression': true
    }
  })
  t.equal(response.statusCode, 200)
  t.notOk(response.headers['content-encoding'])
  t.same(response.rawPayload, fileBuffer)
  t.equal(response.payload, fileBuffer.toString('utf-8'))
})

test('It should not compress :', async (t) => {
  t.test('Using `reply.compress()` :', async (t) => {
    t.test('when payload length is smaller than the `threshold` defined value', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { threshold: 128 })

      fastify.get('/', (request, reply) => {
        reply
          .type('text/plain')
          .compress('a message')
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'deflate'
        }
      })
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-encoding'])
      t.equal(response.payload, 'a message')
    })

    t.test('when `customTypes` is set and does not match `Content-Type` reply header or `mime-db`', async (t) => {
      t.plan(2)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { customTypes: /x-user-header$/ })

      fastify.get('/', (request, reply) => {
        reply
          .type('application/x-other-type')
          .compress(createReadStream('./package.json'))
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'gzip'
        }
      })
      t.notOk(response.headers['content-encoding'])
      t.equal(response.statusCode, 200)
    })

    t.test('when `X-No-Compression` request header is `true`', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { global: true, threshold: 0 })

      const json = { hello: 'world' }
      fastify.get('/', (request, reply) => {
        reply.compress(json)
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'x-no-compression': true
        }
      })
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-encoding'])
      t.same(JSON.parse(response.payload), json)
    })

    t.test('when `Content-Type` reply header is not set and the content is not detected as a compressible type', async (t) => {
      t.plan(2)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { threshold: 0 })

      fastify.addHook('onSend', async (request, response) => {
        response.header('Content-Type', undefined)
      })

      const json = { hello: 'world' }
      fastify.get('/', (request, reply) => {
        // The auto-dectection will fallback as an 'application/json' type
        reply.compress(json)
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'identity'
        }
      })
      t.notOk(response.headers['content-encoding'])
      t.equal(response.payload, JSON.stringify(json))
    })

    t.test('when `Content-Type` reply header is a mime type with undefined compressible values', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { threshold: 0 })

      fastify.get('/', (request, reply) => {
        reply
          .type('image/webp')
          .compress('hello')
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'gzip, deflate, br'
        }
      })
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-encoding'])
      t.equal(response.payload, 'hello')
    })

    t.test('when `Content-Type` reply header value is `text/event-stream`', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { threshold: 0 })

      fastify.get('/', (_req, reply) => {
        const stream = new PassThrough()

        reply
          .type('text/event-stream')
          .compress(stream)

        stream.write('event: open\n\n')
        stream.write('event: change\ndata: schema\n\n')
        stream.end()
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET'
      })
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-encoding'])
      t.same(response.payload, 'event: open\n\nevent: change\ndata: schema\n\n')
    })

    t.test('when `Content-Type` reply header value is an invalid type', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { threshold: 0 })

      fastify.get('/', (request, reply) => {
        reply
          .type('something/invalid')
          .compress('a message')
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'deflate'
        }
      })
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-encoding'])
      t.equal(response.payload, 'a message')
    })

    t.test('when `Accept-Encoding` request header is missing', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { global: true })

      fastify.get('/', (request, reply) => {
        reply
          .type('text/plain')
          .compress(createReadStream('./package.json'))
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET'
      })
      t.equal(response.headers.vary, 'accept-encoding')
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-encoding'])
    })

    t.test('when `Accept-Encoding` request header is set to `identity`', async (t) => {
      t.plan(2)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { global: true, threshold: 0 })

      fastify.get('/', (request, reply) => {
        reply.compress({ hello: 'world' })
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'identity'
        }
      })
      const payload = JSON.parse(response.payload)
      t.notOk(response.headers['content-encoding'])
      t.same({ hello: 'world' }, payload)
    })

    t.test('when `Accept-Encoding` request header value is not supported', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { global: true })

      fastify.get('/', (request, reply) => {
        reply
          .type('text/plain')
          .compress(createReadStream('./package.json'))
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'invalid'
        }
      })
      const file = readFileSync('./package.json', 'utf8')
      t.equal(response.headers.vary, 'accept-encoding')
      t.equal(response.statusCode, 200)
      t.equal(response.payload, file)
    })

    t.test('when `Accept-Encoding` request header value is not supported (with quality value)', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { global: true })

      fastify.get('/', (request, reply) => {
        reply
          .type('text/plain')
          .compress(createReadStream('./package.json'))
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'lzma;q=1.0'
        }
      })
      const file = readFileSync('./package.json', 'utf8')
      t.equal(response.headers.vary, 'accept-encoding')
      t.equal(response.statusCode, 200)
      t.equal(response.payload, file)
    })

    t.test('when `Accept-Encoding` request header is set to `identity and `inflateIfDeflated` is `true``', async (t) => {
      t.plan(2)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { global: true, inflateIfDeflated: true, threshold: 0 })

      fastify.get('/', (request, reply) => {
        reply.compress({ hello: 'world' })
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'identity'
        }
      })
      const payload = JSON.parse(response.payload)
      t.notOk(response.headers['content-encoding'])
      t.same({ hello: 'world' }, payload)
    })
  })

  t.test('Using `onSend` hook :', async (t) => {
    t.test('when there is no payload', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { threshold: 0 })

      fastify.get('/', (request, reply) => {
        reply.send(undefined)
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'gzip'
        }
      })
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-encoding'])
      t.equal(response.payload, '')
    })

    t.test('when payload length is smaller than the `threshold` defined value', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { threshold: 128 })

      fastify.get('/', (request, reply) => {
        reply
          .header('Content-Type', 'text/plain')
          .send('a message')
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'deflate'
        }
      })
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-encoding'])
      t.equal(response.payload, 'a message')
    })

    t.test('when `customTypes` is set and does not match `Content-Type` reply header or `mime-db`', async (t) => {
      t.plan(2)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { customTypes: /x-user-header$/ })

      fastify.get('/', (request, reply) => {
        reply
          .type('application/x-other-type')
          .send(createReadStream('./package.json'))
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'gzip'
        }
      })
      t.notOk(response.headers['content-encoding'])
      t.equal(response.statusCode, 200)
    })

    t.test('when `X-No-Compression` request header is `true`', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { threshold: 0 })

      const json = { hello: 'world' }
      fastify.get('/', (request, reply) => {
        reply.send(json)
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'x-no-compression': true
        }
      })
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-encoding'])
      t.same(JSON.parse(response.payload), json)
    })

    t.test('when `Content-Type` reply header is not set and the content is not detected as a compressible type', async (t) => {
      t.plan(2)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { threshold: 0 })

      fastify.addHook('onSend', async (request, response) => {
        response.header('Content-Type', undefined)
      })

      const json = { hello: 'world' }
      fastify.get('/', (request, reply) => {
        // The auto-dectection will fallback as an 'application/json' type
        reply.send(json)
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'identity'
        }
      })
      t.notOk(response.headers['content-encoding'])
      t.equal(response.payload, JSON.stringify(json))
    })

    t.test('when `Content-Type` reply header is a mime type with undefined compressible values', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { threshold: 0 })

      fastify.get('/', (request, reply) => {
        reply
          .type('image/webp')
          .send('hello')
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'gzip, deflate, br'
        }
      })
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-encoding'])
      t.equal(response.payload, 'hello')
    })

    t.test('when `Content-Type` reply header value is `text/event-stream`', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { threshold: 0 })

      fastify.get('/', (_req, reply) => {
        const stream = new PassThrough()

        reply
          .header('Content-Type', 'text/event-stream')
          .send(stream)

        stream.write('event: open\n\n')
        stream.write('event: change\ndata: schema\n\n')
        stream.end()
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET'
      })
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-encoding'])
      t.same(response.payload, 'event: open\n\nevent: change\ndata: schema\n\n')
    })

    t.test('when `Content-Type` reply header value is an invalid type', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { threshold: 0 })

      fastify.get('/', (request, reply) => {
        reply
          .header('Content-Type', 'something/invalid')
          .send('a message')
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'deflate'
        }
      })
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-encoding'])
      t.equal(response.payload, 'a message')
    })

    t.test('when `Accept-Encoding` request header is missing', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { global: true })

      fastify.get('/', (request, reply) => {
        reply
          .header('Content-Type', 'text/plain')
          .send(createReadStream('./package.json'))
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET'
      })
      t.equal(response.headers.vary, 'accept-encoding')
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-encoding'])
    })

    t.test('when `Accept-Encoding` request header is set to `identity`', async (t) => {
      t.plan(2)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { global: true, threshold: 0 })

      fastify.get('/', (request, reply) => {
        reply.send({ hello: 'world' })
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'identity'
        }
      })
      const payload = JSON.parse(response.payload)
      t.notOk(response.headers['content-encoding'])
      t.same({ hello: 'world' }, payload)
    })

    t.test('when `Accept-Encoding` request header value is not supported', async (t) => {
      t.plan(2)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { global: true })

      fastify.get('/', (request, reply) => {
        reply
          .header('Content-Type', 'text/plain')
          .send('something')
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'invalid'
        }
      })
      t.equal(response.statusCode, 200)
      t.equal(response.payload, 'something')
    })

    t.test('when `Accept-Encoding` request header value is not supported (with quality value)', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { global: true })

      fastify.get('/', (request, reply) => {
        reply
          .header('Content-Type', 'text/plain')
          .send(createReadStream('./package.json'))
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'lzma;q=1.0'
        }
      })
      const file = readFileSync('./package.json', 'utf8')
      t.equal(response.headers.vary, 'accept-encoding')
      t.equal(response.statusCode, 200)
      t.equal(response.payload, file)
    })

    t.test('when `Accept-Encoding` request header is set to `identity and `inflateIfDeflated` is `true``', async (t) => {
      t.plan(2)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { global: true, inflateIfDeflated: true, threshold: 0 })

      fastify.get('/', (request, reply) => {
        reply.send({ hello: 'world' })
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'identity'
        }
      })
      const payload = JSON.parse(response.payload)
      t.notOk(response.headers['content-encoding'])
      t.same({ hello: 'world' }, payload)
    })
  })
})

test('It should not double-compress :', async (t) => {
  t.test('when using `reply.compress()` to send an already deflated Stream', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(
          createReadStream('./package.json').pipe(zlib.createDeflate())
        )
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
    t.equal(response.headers['content-encoding'], 'deflate')
    t.equal(payload.toString('utf-8'), file)
  })

  t.test('when using `reply.compress()` to send an already gzipped Stream', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(
          createReadStream('./package.json').pipe(zlib.createGzip())
        )
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'gzip')
    t.equal(payload.toString('utf-8'), file)
  })

  t.test('when using `onSend` hook to send an already brotli compressed Stream', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    const file = readFileSync('./package.json', 'utf8')
    fastify.get('/', (request, reply) => {
      const payload = zlib.brotliCompressSync(file)

      reply
        .type('application/json')
        .header('content-encoding', 'br')
        .header('content-length', payload.length)
        .send(payload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'br,gzip,deflate'
      }
    })
    const payload = zlib.brotliDecompressSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'br')
    t.equal(response.headers['content-length'], response.rawPayload.length)
    t.equal(payload.toString('utf-8'), file)
  })

  t.test('when using `onSend` hook to send an already deflated Stream', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    const file = readFileSync('./package.json', 'utf8')
    fastify.get('/', (request, reply) => {
      const payload = zlib.deflateSync(file)

      reply
        .type('application/json')
        .header('content-encoding', 'deflate')
        .header('content-length', payload.length)
        .send(payload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'br,gzip,deflate'
      }
    })
    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'deflate')
    t.equal(response.headers['content-length'], response.rawPayload.length)
    t.equal(payload.toString('utf-8'), file)
  })

  t.test('when using `onSend` hook to send an already gzipped Stream', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    const file = readFileSync('./package.json', 'utf8')
    fastify.get('/', (request, reply) => {
      const payload = zlib.gzipSync(file)

      reply
        .type('application/json')
        .header('content-encoding', 'gzip')
        .header('content-length', payload.length)
        .send(payload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'gzip')
    t.equal(response.headers['content-length'], response.rawPayload.length)
    t.equal(payload.toString('utf-8'), file)
  })
})

test('It should not compress Stream data and add a `Content-Encoding` reply header :', async (t) => {
  t.test('Using `onSend` hook if `Accept-Encoding` request header value is `identity`', async (t) => {
    t.test('when `inflateIfDeflated` is `true` and `encodings` is not set', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { global: true, inflateIfDeflated: true })

      fastify.get('/', (request, reply) => {
        reply
          .header('Content-Type', 'application/octet-stream')
          .send(createReadStream('./package.json'))
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'identity'
        }
      })
      const file = readFileSync('./package.json', 'utf8')
      t.equal(response.statusCode, 200)
      t.equal(response.headers['content-encoding'], 'identity')
      t.equal(file, response.payload)
    })

    t.test('when `inflateIfDeflated` is `true` and `encodings` is set', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, {
        global: true,
        inflateIfDeflated: true,
        encodings: ['deflate', 'gzip']
      })

      fastify.get('/', (request, reply) => {
        reply.send(createReadStream('./package.json'))
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'identity'
        }
      })
      const file = readFileSync('./package.json', 'utf-8')
      t.equal(response.statusCode, 200)
      t.equal(response.headers['content-encoding'], 'identity')
      t.same(response.payload, file)
    })
  })

  t.test('Using `reply.compress()` if `Accept-Encoding` request header value is `identity`', async (t) => {
    t.test('when `inflateIfDeflated` is `true` and `encodings` is not set', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { global: true, inflateIfDeflated: true })

      fastify.get('/', (request, reply) => {
        reply
          .type('application/octet-stream')
          .compress(createReadStream('./package.json'))
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          'accept-encoding': 'identity'
        }
      })
      const file = readFileSync('./package.json', 'utf8')
      t.equal(response.statusCode, 200)
      t.equal(response.headers['content-encoding'], 'identity')
      t.equal(file, response.payload)
    })

    t.test('when `inflateIfDeflated` is `true` and `encodings` is set', async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, {
        global: true,
        inflateIfDeflated: true,
        encodings: ['deflate', 'gzip']
      })

      fastify.get('/', (request, reply) => {
        reply.compress(createReadStream('./package.json'))
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'identity'
        }
      })
      const file = readFileSync('./package.json', 'utf-8')
      t.equal(response.statusCode, 200)
      t.equal(response.headers['content-encoding'], 'identity')
      t.same(response.payload, file)
    })
  })
})

test('It should return a serialized payload when `inflateIfDeflated` is `true` and `X-No-Compression` request header is `true`', async (t) => {
  t.plan(6)

  const fastify = Fastify()
  await fastify.register(compressPlugin, {
    global: true,
    inflateIfDeflated: true,
    threshold: 0
  })

  const json = { hello: 'world' }
  const compressedBufferPayload = zlib.brotliCompressSync(Buffer.from(json.toString()))

  fastify.get('/one', (request, reply) => {
    reply.send(json)
  })

  fastify.get('/two', (request, reply) => {
    reply.send(compressedBufferPayload)
  })

  const one = await fastify.inject({
    url: '/one',
    method: 'GET',
    headers: {
      'x-no-compression': true
    }
  })
  t.equal(one.statusCode, 200)
  t.notOk(one.headers['content-encoding'])
  t.same(JSON.parse(one.payload), json)

  const two = await fastify.inject({
    url: '/two',
    method: 'GET',
    headers: {
      'x-no-compression': true
    }
  })
  t.equal(two.statusCode, 200)
  t.notOk(two.headers['content-encoding'])
  t.equal(two.payload, compressedBufferPayload.toString())
})

test('It should close the stream', async (t) => {
  t.plan(3)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { global: true })

  const stream = createReadStream('./package.json')
  const closed = once(stream, 'close')

  fastify.get('/', (request, reply) => {
    stream.on('close', () => t.ok('stream closed'))

    reply
      .type('text/plain')
      .compress(stream)
  })

  const response = await fastify.inject({
    url: '/',
    method: 'GET'
  })

  const file = readFileSync('./package.json', 'utf8')
  t.equal(response.statusCode, 200)
  t.equal(file, response.payload)
  await closed
})

test('It should log an existing error with stream onEnd handler', async (t) => {
  t.plan(1)

  let actual = null
  const logger = new Writable({
    write (chunk, encoding, callback) {
      actual = JSON.parse(chunk.toString())
      callback()
    }
  })

  const fastify = Fastify({
    global: true,
    logger: {
      level: 'error',
      stream: logger
    }
  })
  await fastify.register(compressPlugin)

  const expect = new Error('something wrong')

  fastify.get('/', (request, reply) => {
    const stream = new Readable({
      read (size) {
        this.destroy(expect)
      }
    })

    reply
      .type('text/plain')
      .compress(stream)
  })

  await fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  })
  t.equal(actual.msg, expect.message)
})

test('It should support stream1 :', async (t) => {
  t.test('when using `reply.compress()`', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    fastify.get('/', (request, reply) => {
      const stream = JSONStream.stringify()

      reply
        .type('text/plain')
        .compress(stream)

      stream.write({ hello: 'world' })
      stream.end({ a: 42 })
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'gzip')
    t.same(JSON.parse(payload.toString()), [{ hello: 'world' }, { a: 42 }])
  })

  t.test('when using `onSend` hook', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    fastify.get('/', (request, reply) => {
      const stream = JSONStream.stringify()

      reply
        .type('text/plain')
        .send(stream)

      stream.write({ hello: 'world' })
      stream.end({ a: 42 })
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'gzip')
    t.same(JSON.parse(payload.toString()), [{ hello: 'world' }, { a: 42 }])
  })
})

test('It should remove `Content-Length` header :', async (t) => {
  t.test('using `reply.compress()`', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', (request, reply) => {
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
    t.equal(response.headers['content-encoding'], 'deflate')
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(payload.toString('utf-8'), file)
  })

  t.test('using `reply.compress()` on a Stream when `inflateIfDeflated` is `true` and `X-No-Compression` request header is `true`', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, inflateIfDeflated: true })

    fastify.get('/', (request, reply) => {
      reply
        .type('application/octet-stream')
        .compress(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'x-no-compression': true
      }
    })
    const file = readFileSync('./package.json', 'utf8')
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(file, response.payload)
  })

  t.test('using `onSend` hook', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', (request, reply) => {
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
    t.equal(response.headers['content-encoding'], 'deflate')
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(payload.toString('utf-8'), file)
  })

  t.test('using `onSend` hook on a Stream When `inflateIfDeflated` is `true` and `X-No-Compression` request header is `true`', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, inflateIfDeflated: true })

    fastify.get('/', (request, reply) => {
      reply
        .header('Content-Type', 'application/octet-stream')
        .send(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'x-no-compression': true
      }
    })
    const file = readFileSync('./package.json', 'utf8')
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(file, response.payload)
  })
})

test('When `removeContentLengthHeader` is `false`, it should not remove `Content-Length` header :', async (t) => {
  t.test('using `reply.compress()`', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, removeContentLengthHeader: false })

    fastify.get('/', (request, reply) => {
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
    t.equal(response.headers['content-encoding'], 'deflate')
    t.equal(response.headers['content-length'], payload.length.toString())
    t.equal(payload.toString('utf-8'), file)
  })

  t.test('using `onSend` hook', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, removeContentLengthHeader: false })

    fastify.get('/', (request, reply) => {
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
    t.equal(response.headers['content-encoding'], 'deflate')
    t.equal(response.headers['content-length'], payload.length.toString())
    t.equal(payload.toString('utf-8'), file)
  })
})

test('It should add hooks correctly: ', async (t) => {
  t.test('`onRequest` hooks', async (t) => {
    t.plan(14)

    const fastify = Fastify()

    fastify.addHook('onRequest', async (request, reply) => {
      reply.header('x-fastify-global-test', 'ok')
    })

    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    fastify.get('/one', {
      onRequest: [
        async (request, reply) => { reply.header('x-fastify-test-one', 'ok') }
      ]
    }, (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    fastify.get('/two', {
      onRequest: async (request, reply) => { reply.header('x-fastify-test-two', 'ok') }
    }, (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    fastify.get('/three', { onRequest: null }, (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const file = readFileSync('./package.json', 'utf8')
    await fastify.inject({
      url: '/one',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    }).then((response) => {
      const payload = zlib.inflateSync(response.rawPayload)
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-length'], 'no content length')
      t.equal(response.headers['x-fastify-global-test'], 'ok')
      t.equal(response.headers['x-fastify-test-one'], 'ok')
      t.equal(payload.toString('utf-8'), file)
    }).catch((err) => {
      t.error(err)
    })

    await fastify.inject({
      url: '/two',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    }).then((response) => {
      const payload = zlib.inflateSync(response.rawPayload)
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-length'], 'no content length')
      t.equal(response.headers['x-fastify-global-test'], 'ok')
      t.equal(response.headers['x-fastify-test-two'], 'ok')
      t.equal(payload.toString('utf-8'), file)
    }).catch((err) => {
      t.error(err)
    })

    await fastify.inject({
      url: '/three',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    }).then((response) => {
      const payload = zlib.inflateSync(response.rawPayload)
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-length'], 'no content length')
      t.equal(response.headers['x-fastify-global-test'], 'ok')
      t.equal(payload.toString('utf-8'), file)
    }).catch((err) => {
      t.error(err)
    })
  })

  t.test('`onSend` hooks', async (t) => {
    t.plan(14)

    const fastify = Fastify()

    fastify.addHook('onSend', async (request, reply) => {
      reply.header('x-fastify-global-test', 'ok')
    })

    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    fastify.get('/one', {
      onSend: [
        async (request, reply) => { reply.header('x-fastify-test-one', 'ok') }
      ]
    }, (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    fastify.get('/two', {
      onSend: async (request, reply) => { reply.header('x-fastify-test-two', 'ok') }
    }, (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    fastify.get('/three', { onSend: null }, (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const file = readFileSync('./package.json', 'utf8')
    await fastify.inject({
      url: '/one',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    }).then((response) => {
      const payload = zlib.inflateSync(response.rawPayload)
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-length'], 'no content length')
      t.equal(response.headers['x-fastify-global-test'], 'ok')
      t.equal(response.headers['x-fastify-test-one'], 'ok')
      t.equal(payload.toString('utf-8'), file)
    }).catch((err) => {
      t.error(err)
    })

    await fastify.inject({
      url: '/two',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    }).then((response) => {
      const payload = zlib.inflateSync(response.rawPayload)
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-length'], 'no content length')
      t.equal(response.headers['x-fastify-global-test'], 'ok')
      t.equal(response.headers['x-fastify-test-two'], 'ok')
      t.equal(payload.toString('utf-8'), file)
    }).catch((err) => {
      t.error(err)
    })

    await fastify.inject({
      url: '/three',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    }).then((response) => {
      const payload = zlib.inflateSync(response.rawPayload)
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-length'], 'no content length')
      t.equal(response.headers['x-fastify-global-test'], 'ok')
      t.equal(payload.toString('utf-8'), file)
    }).catch((err) => {
      t.error(err)
    })
  })

  t.test('`preParsing` hooks', async (t) => {
    t.plan(14)

    const fastify = Fastify()

    fastify.addHook('preParsing', async (request, reply, payload) => {
      reply.header('x-fastify-global-test', 'ok')
      return payload
    })

    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    fastify.get('/one', {
      preParsing: [
        async (request, reply, payload) => {
          reply.header('x-fastify-test-one', 'ok')
          return payload
        }
      ]
    }, (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    fastify.get('/two', {
      preParsing: async (request, reply, payload) => {
        reply.header('x-fastify-test-two', 'ok')
        return payload
      }
    }, (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    fastify.get('/three', { preParsing: null }, (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const file = readFileSync('./package.json', 'utf8')
    await fastify.inject({
      url: '/one',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    }).then((response) => {
      const payload = zlib.inflateSync(response.rawPayload)
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-length'], 'no content length')
      t.equal(response.headers['x-fastify-global-test'], 'ok')
      t.equal(response.headers['x-fastify-test-one'], 'ok')
      t.equal(payload.toString('utf-8'), file)
    }).catch((err) => {
      t.error(err)
    })

    await fastify.inject({
      url: '/two',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    }).then((response) => {
      const payload = zlib.inflateSync(response.rawPayload)
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-length'], 'no content length')
      t.equal(response.headers['x-fastify-global-test'], 'ok')
      t.equal(response.headers['x-fastify-test-two'], 'ok')
      t.equal(payload.toString('utf-8'), file)
    }).catch((err) => {
      t.error(err)
    })

    await fastify.inject({
      url: '/three',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    }).then((response) => {
      const payload = zlib.inflateSync(response.rawPayload)
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-length'], 'no content length')
      t.equal(response.headers['x-fastify-global-test'], 'ok')
      t.equal(payload.toString('utf-8'), file)
    }).catch((err) => {
      t.error(err)
    })
  })
})

test('When `Accept-Encoding` request header values are not supported and `onUnsupportedEncoding` is defined :', async (t) => {
  t.test('it should call the defined `onUnsupportedEncoding()` method', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      onUnsupportedEncoding: (encoding, request, reply) => {
        reply.code(406)
        return JSON.stringify({ hello: encoding })
      }
    })

    fastify.get('/', (request, reply) => {
      reply
        .header('Content-Type', 'text/plain')
        .send(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'hello'
      }
    })
    t.equal(response.statusCode, 406)
    t.same(JSON.parse(response.payload), { hello: 'hello' })
  })

  t.test('it should call the defined `onUnsupportedEncoding()` method and throw an error', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      onUnsupportedEncoding: (encoding, request, reply) => {
        reply.code(406)
        throw new Error('testing error')
      }
    })

    fastify.get('/', (request, reply) => {
      reply
        .header('Content-Type', 'text/plain')
        .send(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'hello'
      }
    })
    t.equal(response.statusCode, 406)
    t.same(JSON.parse(response.payload), {
      error: 'Not Acceptable',
      message: 'testing error',
      statusCode: 406
    })
  })
})

test('`Accept-Encoding` request header values :', async (t) => {
  t.test('can contain white space', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { threshold: 0 })

    const json = { hello: 'world' }

    fastify.get('/', (request, reply) => {
      reply.send(json)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'hello, gzip'
      }
    })
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'gzip')
    t.equal(payload.toString('utf-8'), JSON.stringify(json))
  })

  t.test('can contain mixed uppercase and lowercase characters (e.g.: compressing a Stream)', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'GZiP'
      }
    })
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'gzip')
    t.equal(payload.toString('utf-8'), file)
  })

  t.test('can contain mixed uppercase and lowercase characters (e.g.: compressing a Buffer)', async (t) => {
    t.plan(1)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, threshold: 0 })

    const buf = Buffer.from('hello world')
    fastify.get('/', (request, reply) => {
      reply.compress(buf)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'GzIp'
      }
    })
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })

  t.test('should support `gzip` alias value `x-gzip`', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(
          createReadStream('./package.json')
        )
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'x-gzip'
      }
    })
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'gzip')
    t.equal(payload.toString('utf-8'), file)
  })

  t.test('should support quality syntax', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(
          createReadStream('./package.json').pipe(zlib.createDeflate())
        )
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip;q=0.5,deflate;q=0.6,identity;q=0.3'
      }
    })
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(response.headers['content-encoding'], 'deflate')
    t.equal(payload.toString('utf-8'), file)
  })
})

test('It should compress data if `customTypes` is set and matches `Content-Type` reply header value', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  await fastify.register(compressPlugin, { customTypes: /x-user-header$/ })

  fastify.get('/', (request, reply) => {
    reply
      .type('application/x-user-header')
      .send(createReadStream('./package.json'))
  })

  const response = await fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  })
  const file = readFileSync('./package.json', 'utf8')
  const payload = zlib.gunzipSync(response.rawPayload)
  t.equal(response.headers['content-encoding'], 'gzip')
  t.equal(payload.toString('utf-8'), file)
})

test('It should not apply `customTypes` option if the passed value is not a RegExp', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { customTypes: 'x-user-header' })

  fastify.get('/', (request, reply) => {
    reply
      .type('application/x-user-header')
      .send(createReadStream('./package.json'))
  })

  const response = await fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  })
  t.notOk(response.headers['content-encoding'])
  t.equal(response.statusCode, 200)
})

test('When `encodings` option is set, it should only use the registered value', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { encodings: ['deflate'] })

  fastify.get('/', (request, reply) => {
    reply.send(createReadStream('./package.json'))
  })

  const response = await fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'br,gzip,deflate'
    }
  })
  t.equal(response.headers['content-encoding'], 'deflate')
  t.equal(response.statusCode, 200)
})

test('It should send data compressed according to `brotliOptions`', async (t) => {
  t.plan(2)
  const brotliOptions = {
    params: {
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
      [zlib.constants.BROTLI_PARAM_QUALITY]: 4
    }
  }

  const fastify = Fastify()
  await fastify.register(compressPlugin, { global: true, brotliOptions })

  fastify.get('/', (request, reply) => {
    reply
      .type('text/plain')
      .compress(createReadStream('./package.json'))
  })

  const response = await fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'br'
    }
  })

  const file = readFileSync('./package.json', 'utf8')
  const payload = zlib.brotliDecompressSync(response.rawPayload, brotliOptions)
  t.equal(response.headers['content-encoding'], 'br')
  t.equal(payload.toString('utf-8'), file)
})

test('It should send data compressed according to `zlibOptions` :', async (t) => {
  t.test('when using deflate encoding', async (t) => {
    t.plan(2)

    const zlibOptions = {
      level: 1,
      dictionary: Buffer.from('fastifycompress')
    }

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      zlibOptions
    })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    })
    const file = readFileSync('./package.json')
    t.equal(response.headers['content-encoding'], 'deflate')
    t.same(response.rawPayload, zlib.deflateSync(file, zlibOptions))
  })

  t.test('when using gzip encoding', async (t) => {
    t.plan(2)

    const zlibOptions = { level: 1 }

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      zlibOptions
    })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'gzip'
      }
    })
    const file = readFileSync('./package.json')
    t.equal(response.headers['content-encoding'], 'gzip')
    t.same(response.rawPayload, zlib.gzipSync(file, zlibOptions))
  })
})

test('It should concat `accept-encoding` to `Vary` reply header if present', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { global: true })

  fastify.get('/', (request, reply) => {
    reply
      .header('vary', 'different-header')
      .type('text/plain')
      .compress(createReadStream('./package.json'))
  })

  fastify.get('/foo', (request, reply) => {
    reply
      .header('vary', ['different-header', 'my-header'])
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
    t.same(response.headers.vary, 'different-header, accept-encoding')
  }).catch((err) => {
    t.error(err)
  })

  await fastify.inject({
    url: '/foo',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }).then((response) => {
    t.same(response.headers.vary, 'different-header, my-header, accept-encoding')
  }).catch((err) => {
    t.error(err)
  })
})

test('It should not add `accept-encoding` to `Vary` reply header if already present', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { global: true })

  fastify.get('/', (request, reply) => {
    reply
      .header('vary', 'accept-encoding,different-header')
      .type('text/plain')
      .compress(createReadStream('./package.json'))
  })

  fastify.get('/foo', (request, reply) => {
    reply
      .header('vary', 'accept-encoding, different-header, my-header')
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
    t.same(response.headers.vary, 'accept-encoding,different-header')
  }).catch((err) => {
    t.error(err)
  })

  await fastify.inject({
    url: '/foo',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }).then((response) => {
    t.same(response.headers.vary, 'accept-encoding, different-header, my-header')
  }).catch((err) => {
    t.error(err)
  })
})

test('It should follow the `Accept-Encoding` request header encoding order', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { global: true })

  fastify.get('/', (request, reply) => {
    reply
      .type('text/plain')
      .compress(createReadStream('./package.json'))
  })

  const response = await fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'invalid,br,gzip'
    }
  })
  const file = readFileSync('./package.json', 'utf8')
  const payload = zlib.brotliDecompressSync(response.rawPayload)
  t.equal(response.headers['content-encoding'], 'br')
  t.equal(payload.toString('utf-8'), file)
})

test('It should sort and follow custom `encodings` options', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  await fastify.register(compressPlugin, {
    global: true,
    encodings: ['gzip', 'br']
  })

  fastify.get('/', (request, reply) => {
    reply
      .type('text/plain')
      .compress(createReadStream('./package.json'))
  })

  const response = await fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'hello,gzip,br'
    }
  })
  const file = readFileSync('./package.json', 'utf8')
  const payload = zlib.brotliDecompressSync(response.rawPayload)
  t.equal(response.headers['content-encoding'], 'br')
  t.equal(payload.toString('utf-8'), file)
})

test('It should sort and follow custom `requestEncodings` options', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  await fastify.register(compressPlugin, {
    global: true,
    requestEncodings: ['gzip', 'br']
  })

  fastify.get('/', (request, reply) => {
    reply
      .type('text/plain')
      .compress(createReadStream('./package.json'))
  })

  const response = await fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'hello,gzip,br'
    }
  })
  const file = readFileSync('./package.json', 'utf8')
  const payload = zlib.brotliDecompressSync(response.rawPayload)
  t.equal(response.headers['content-encoding'], 'br')
  t.equal(payload.toString('utf-8'), file)
})

test('It should uncompress data when `Accept-Encoding` request header is missing :', async (t) => {
  t.test('using the fallback Node.js `zlib.createInflate()` method', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      inflateIfDeflated: true,
      threshold: 0,
      zlib: true // will trigger a fallback on the default zlib.createInflate
    })

    const json = { hello: 'world' }
    fastify.get('/', (request, reply) => {
      reply.send(zlib.deflateSync(JSON.stringify(json)))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET'
    })
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-encoding'])
    t.same(JSON.parse('' + response.payload), json)
  })

  t.test('using the fallback Node.js `zlib.createGunzip()` method', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      inflateIfDeflated: true,
      threshold: 0,
      zlib: true // will trigger a fallback on the default zlib.createGunzip
    })

    const json = { hello: 'world' }
    fastify.get('/', (request, reply) => {
      reply.send(zlib.gzipSync(JSON.stringify(json)))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET'
    })
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-encoding'])
    t.same(JSON.parse('' + response.payload), json)
  })

  t.test('when the data is a deflated Buffer', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      inflateIfDeflated: true,
      threshold: 0
    })

    const json = { hello: 'world' }
    fastify.get('/', (request, reply) => {
      reply.send(zlib.deflateSync(JSON.stringify(json)))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET'
    })
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-encoding'])
    t.same(JSON.parse('' + response.payload), json)
  })

  t.test('when the data is a gzipped Buffer', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      inflateIfDeflated: true,
      threshold: 0
    })

    const json = { hello: 'world' }
    fastify.get('/', (request, reply) => {
      reply.send(zlib.gzipSync(JSON.stringify(json)))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET'
    })
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-encoding'])
    t.same(JSON.parse('' + response.payload), json)
  })

  t.test('when the data is a deflated Stream', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      inflateIfDeflated: true,
      threshold: 0
    })

    fastify.get('/', (request, reply) => {
      reply.send(
        createReadStream('./package.json')
          .pipe(zlib.createDeflate())
      )
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET'
    })
    const file = readFileSync('./package.json', 'utf8')
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-encoding'])
    t.equal(response.rawPayload.toString('utf-8'), file)
  })

  t.test('when the data is a gzipped Stream', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      inflateIfDeflated: true,
      threshold: 0
    })

    fastify.get('/', (request, reply) => {
      reply.send(
        createReadStream('./package.json')
          .pipe(zlib.createGzip())
      )
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET'
    })
    const file = readFileSync('./package.json', 'utf8')
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-encoding'])
    t.equal(response.rawPayload.toString('utf-8'), file)
  })

  t.test('when the data has been compressed multiple times', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      inflateIfDeflated: true,
      threshold: 0
    })

    const json = { hello: 'world' }
    fastify.get('/', (request, reply) => {
      reply.send(
        [0, 1, 2, 3, 4, 5, 6].reduce(
          (x) => zlib.gzipSync(x), JSON.stringify(json)
        )
      )
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET'
    })
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-encoding'])
    t.same(JSON.parse('' + response.payload), json)
  })
})

test('When `onUnsupportedEncoding` is set and the `Accept-Encoding` request header value is an unsupported encoding', async (t) => {
  t.test('it should call the defined `onUnsupportedEncoding()` method', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      onUnsupportedEncoding: (encoding, request, reply) => {
        reply.code(406)
        return JSON.stringify({ hello: encoding })
      }
    })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'hello'
      }
    })
    t.equal(response.statusCode, 406)
    t.equal(response.headers.vary, 'accept-encoding')
    t.same(JSON.parse(response.payload), { hello: 'hello' })
  })

  t.test('it should call the defined `onUnsupportedEncoding()` method and throw an error', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, {
      global: true,
      onUnsupportedEncoding: (encoding, request, reply) => {
        reply.code(406)
        throw new Error('testing error')
      }
    })

    fastify.get('/', (request, reply) => {
      reply
        .type('text/plain')
        .compress(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'hello'
      }
    })
    t.equal(response.statusCode, 406)
    t.same(JSON.parse(response.payload), {
      error: 'Not Acceptable',
      message: 'testing error',
      statusCode: 406
    })
  })
})

test('It should error :', async (t) => {
  t.test('when `encodings` array is empty', (t) => {
    t.plan(1)

    const fastify = Fastify()
    fastify.register(compressPlugin, { encodings: [] })

    fastify.ready(err => {
      t.ok(err instanceof Error)
    })
  })

  t.test('when no entries in `encodings` are supported', (t) => {
    t.plan(1)

    const fastify = Fastify()
    fastify.register(compressPlugin, {
      encodings: ['(not-a-real-encoding)']
    })

    fastify.ready(err => {
      t.ok(err instanceof Error)
    })
  })
})

test('It should return an error when using `reply.compress()` with a missing payload', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { global: true })

  fastify.get('/', (request, reply) => {
    reply.compress()
  })

  const response = await fastify.inject({
    url: '/',
    method: 'GET'
  })
  const payload = JSON.parse(response.payload)
  t.equal(response.statusCode, 500)
  t.same({
    error: 'Internal Server Error',
    message: 'Internal server error',
    statusCode: 500
  }, payload)
})
