'use strict'

const { describe, test } = require('node:test')
const { createReadStream } = require('node:fs')
const { randomBytes } = require('node:crypto')
const zlib = require('node:zlib')
const Fastify = require('fastify')
const compressPlugin = require('../index')

// A compressible body of a given size, so tests can pick which side of
// `threshold` / `syncThreshold` a payload falls on
function buildPayload (size) {
  return 'the quick brown fox jumps over the lazy dog '.repeat(Math.ceil(size / 44)).slice(0, size)
}

// The default `syncThreshold` is derived from the host parallelism, so every test that
// cares about which path a payload takes pins it explicitly to stay deterministic
const syncThreshold = 32768

const smallPayload = buildPayload(4096)
const largePayload = buildPayload(200 * 1024)
// incompressible, so that the already compressed payloads built from it stay
// comfortably above `threshold` and below the pinned `syncThreshold`
const incompressiblePayload = randomBytes(4096)

describe('When a buffered payload fits within `syncThreshold`, it should be compressed synchronously :', async () => {
  test('using gzip', async (t) => {
    t.plan(4)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers.vary, 'accept-encoding')
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.equal(response.headers['content-length'], response.rawPayload.length.toString())
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), smallPayload)
  })

  test('using deflate', async (t) => {
    t.plan(4)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'deflate' }
    })
    t.assert.equal(response.headers.vary, 'accept-encoding')
    t.assert.equal(response.headers['content-encoding'], 'deflate')
    t.assert.equal(response.headers['content-length'], response.rawPayload.length.toString())
    t.assert.equal(zlib.inflateSync(response.rawPayload).toString('utf-8'), smallPayload)
  })

  test('using brotli', async (t) => {
    t.plan(4)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'br' }
    })
    t.assert.equal(response.headers.vary, 'accept-encoding')
    t.assert.equal(response.headers['content-encoding'], 'br')
    t.assert.equal(response.headers['content-length'], response.rawPayload.length.toString())
    t.assert.equal(zlib.brotliDecompressSync(response.rawPayload).toString('utf-8'), smallPayload)
  })

  test('using zstd', async (t) => {
    if (typeof zlib.createZstdCompress !== 'function') {
      t.skip('zstd not supported in this Node.js version')
      return
    }
    t.plan(4)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'zstd' }
    })
    t.assert.equal(response.headers.vary, 'accept-encoding')
    t.assert.equal(response.headers['content-encoding'], 'zstd')
    t.assert.equal(response.headers['content-length'], response.rawPayload.length.toString())
    t.assert.equal(zlib.zstdDecompressSync(response.rawPayload).toString('utf-8'), smallPayload)
  })

  test('using a Buffer payload', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold })

    const buf = Buffer.from(smallPayload)
    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(buf)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.equal(response.headers['content-length'], response.rawPayload.length.toString())
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), smallPayload)
  })

  test('using `reply.compress()`', async (t) => {
    t.plan(4)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false, syncThreshold })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').compress(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers.vary, 'accept-encoding')
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.equal(response.headers['content-length'], response.rawPayload.length.toString())
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), smallPayload)
  })

  test('using a route level `compress` configuration', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false, syncThreshold })

    fastify.get('/', {
      compress: { syncThreshold: 8192 }
    }, (_request, reply) => {
      reply.type('text/plain').send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.equal(response.headers['content-length'], response.rawPayload.length.toString())
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), smallPayload)
  })

  test('it should honour `zlibOptions`', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold, zlibOptions: { level: 9 } })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), smallPayload)
    t.assert.equal(response.rawPayload.length, zlib.gzipSync(smallPayload, { level: 9 }).length)
  })

  test('it should honour `brotliOptions`', async (t) => {
    t.plan(2)

    const brotliOptions = { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold, brotliOptions })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'br' }
    })
    t.assert.equal(zlib.brotliDecompressSync(response.rawPayload).toString('utf-8'), smallPayload)
    t.assert.equal(response.rawPayload.length, zlib.brotliCompressSync(smallPayload, brotliOptions).length)
  })
})

describe('An explicit `syncThreshold` should always win over the computed default :', async () => {
  // the computed default is clamped to [4096, 65536], so these two values sit on either
  // side of every default the formula can produce, whatever the host reports
  test('a value below the computed default should push a payload onto the stream pipeline', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold: 2048 })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.ok(!response.headers['content-length'], 'no content length')
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), smallPayload)
  })

  test('a value above the computed default should keep a payload on the synchronous path', async (t) => {
    t.plan(3)

    const hugePayload = buildPayload(128 * 1024)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold: 256 * 1024 })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(hugePayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.equal(response.headers['content-length'], response.rawPayload.length.toString())
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), hugePayload)
  })

  test('the computed default should compress a payload it covers on every host', async (t) => {
    t.plan(3)

    // 2 KiB is above `threshold` and below the lowest default the formula can produce
    const payload = buildPayload(2048)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(payload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.equal(response.headers['content-length'], response.rawPayload.length.toString())
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), payload)
  })

  test('the computed default should stream a payload above the highest value it can produce', async (t) => {
    t.plan(3)

    // 256 KiB is above the upper clamp of the formula, so it streams on every host
    const payload = buildPayload(256 * 1024)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(payload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.ok(!response.headers['content-length'], 'no content length')
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), payload)
  })
})

describe('It should fall back to the stream pipeline when the payload is not eligible :', async () => {
  test('when the payload is smaller than `threshold`', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send('hello world')
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.ok(!response.headers.vary)
    t.assert.ok(!response.headers['content-encoding'])
    t.assert.equal(response.payload, 'hello world')
  })

  test('when the payload is bigger than `syncThreshold`', async (t) => {
    t.plan(4)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(largePayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers.vary, 'accept-encoding')
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    // the streamed path cannot know the compressed size upfront
    t.assert.ok(!response.headers['content-length'], 'no content length')
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), largePayload)
  })

  test('when `syncThreshold` is `0`', async (t) => {
    t.plan(4)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold: 0 })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers.vary, 'accept-encoding')
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.ok(!response.headers['content-length'], 'no content length')
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), smallPayload)
  })

  test('when `syncThreshold` is `0` using `reply.compress()`', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false, syncThreshold: 0 })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').compress(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.ok(!response.headers['content-length'], 'no content length')
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), smallPayload)
  })

  test('when the payload is a Stream', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(createReadStream('./package.json'))
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.ok(!response.headers['content-length'], 'no content length')
    t.assert.ok(zlib.gunzipSync(response.rawPayload).length > 0)
  })

  test('when the payload is a Web ReadableStream', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold })

    fastify.get('/', (_request, reply) => {
      const stream = new ReadableStream({
        start (controller) {
          controller.enqueue(new TextEncoder().encode(smallPayload))
          controller.close()
        }
      })
      reply.type('text/plain').send(stream)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.ok(!response.headers['content-length'], 'no content length')
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), smallPayload)
  })

  test('when a custom `zlib` provides no synchronous method', async (t) => {
    t.plan(4)

    let usedCustom = false
    const customZlib = { createGzip: () => (usedCustom = true) && zlib.createGzip() }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold, zlib: customZlib })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(usedCustom, true)
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.ok(!response.headers['content-length'], 'no content length')
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), smallPayload)
  })

  test('when a custom `zlib` provides no synchronous method using `reply.compress()`', async (t) => {
    t.plan(3)

    let usedCustom = false
    const customZlib = { createDeflate: () => (usedCustom = true) && zlib.createDeflate() }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false, syncThreshold, zlib: customZlib })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').compress(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'deflate' }
    })
    t.assert.equal(usedCustom, true)
    t.assert.ok(!response.headers['content-length'], 'no content length')
    t.assert.equal(zlib.inflateSync(response.rawPayload).toString('utf-8'), smallPayload)
  })

  test('when `removeContentLengthHeader` is `false` and the reply already carries a `Content-Length`', async (t) => {
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold, removeContentLengthHeader: false })

    fastify.get('/', (_request, reply) => {
      reply
        .type('text/plain')
        .header('content-length', '' + Buffer.byteLength(smallPayload))
        .send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    // the caller provided value is preserved, as it is on the streamed path
    t.assert.equal(response.headers['content-length'], Buffer.byteLength(smallPayload).toString())
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), smallPayload)
  })
})

describe('When `syncThreshold` is `0`, every encoding should keep using the stream pipeline :', async () => {
  // a custom `zlib` exposing an unrelated method only: every encoding falls back
  // to the native stream compressor, exactly as it did before the synchronous path
  const customZlib = { createGunzip: zlib.createGunzip }

  for (const [encoding, decompress] of [
    ['br', zlib.brotliDecompressSync],
    ['gzip', zlib.gunzipSync],
    ['deflate', zlib.inflateSync]
  ]) {
    test(`using ${encoding} with a custom \`zlib\``, async (t) => {
      t.plan(3)

      const fastify = Fastify()
      await fastify.register(compressPlugin, { global: true, zlib: customZlib, syncThreshold: 0 })

      fastify.get('/', (_request, reply) => {
        reply.type('text/plain').send(smallPayload)
      })

      const response = await fastify.inject({
        url: '/',
        method: 'GET',
        headers: { 'accept-encoding': encoding }
      })
      t.assert.equal(response.headers['content-encoding'], encoding)
      t.assert.ok(!response.headers['content-length'], 'no content length')
      t.assert.equal(decompress(response.rawPayload).toString('utf-8'), smallPayload)
    })
  }

  test('using zstd with a custom `zlib`', async (t) => {
    if (typeof zlib.createZstdCompress !== 'function') {
      t.skip('zstd not supported in this Node.js version')
      return
    }
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, zlib: customZlib, syncThreshold: 0 })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'zstd' }
    })
    t.assert.equal(response.headers['content-encoding'], 'zstd')
    t.assert.ok(!response.headers['content-length'], 'no content length')
    t.assert.equal(zlib.zstdDecompressSync(response.rawPayload).toString('utf-8'), smallPayload)
  })

  test('using zstd with the native `zlib`', async (t) => {
    if (typeof zlib.createZstdCompress !== 'function') {
      t.skip('zstd not supported in this Node.js version')
      return
    }
    t.plan(3)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold: 0 })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'zstd' }
    })
    t.assert.equal(response.headers['content-encoding'], 'zstd')
    t.assert.ok(!response.headers['content-length'], 'no content length')
    t.assert.equal(zlib.zstdDecompressSync(response.rawPayload).toString('utf-8'), smallPayload)
  })
})

describe('It should use a synchronous method provided by a custom `zlib` :', async () => {
  test('using `gzipSync`', async (t) => {
    t.plan(3)

    let usedCustom = false
    const customZlib = {
      gzipSync: (payload, options) => {
        usedCustom = true
        return zlib.gzipSync(payload, options)
      }
    }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold, zlib: customZlib })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(usedCustom, true)
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.equal(zlib.gunzipSync(response.rawPayload).toString('utf-8'), smallPayload)
  })
})

describe('It should pass already compressed payloads through untouched :', async () => {
  test('when the payload is already gzipped', async (t) => {
    t.plan(3)

    const gzipped = zlib.gzipSync(incompressiblePayload)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold })

    fastify.get('/', (_request, reply) => {
      reply.type('application/octet-stream').send(gzipped)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.deepEqual(response.rawPayload, gzipped)
    t.assert.deepEqual(zlib.gunzipSync(response.rawPayload), incompressiblePayload)
  })

  test('when the payload is already deflated', async (t) => {
    t.plan(3)

    const deflated = zlib.deflateSync(incompressiblePayload)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold })

    fastify.get('/', (_request, reply) => {
      reply.type('application/octet-stream').send(deflated)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'deflate' }
    })
    t.assert.equal(response.headers['content-encoding'], 'deflate')
    t.assert.deepEqual(response.rawPayload, deflated)
    t.assert.deepEqual(zlib.inflateSync(response.rawPayload), incompressiblePayload)
  })

  test('when the payload is already gzipped using `reply.compress()`', async (t) => {
    t.plan(2)

    const gzipped = zlib.gzipSync(incompressiblePayload)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false, syncThreshold })

    fastify.get('/', (_request, reply) => {
      reply.type('application/octet-stream').compress(gzipped)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.deepEqual(response.rawPayload, gzipped)
  })
})

describe('It should handle synchronous compression errors :', async () => {
  test('using `onSend` hook', async (t) => {
    t.plan(2)

    const customZlib = {
      gzipSync: () => {
        throw new Error('sync compression failed')
      }
    }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold, zlib: customZlib })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').send(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.statusCode, 500)
    t.assert.equal(JSON.parse(response.payload).message, 'sync compression failed')
  })

  test('using `reply.compress()`', async (t) => {
    t.plan(2)

    const customZlib = {
      gzipSync: () => {
        throw new Error('sync compression failed')
      }
    }

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false, syncThreshold, zlib: customZlib })

    fastify.get('/', (_request, reply) => {
      reply.type('text/plain').compress(smallPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })
    t.assert.equal(response.statusCode, 500)
    t.assert.equal(JSON.parse(response.payload).message, 'sync compression failed')
  })
})
