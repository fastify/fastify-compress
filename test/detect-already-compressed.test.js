'use strict'

const { describe, test } = require('node:test')
const zlib = require('node:zlib')
const { randomBytes } = require('node:crypto')
const Fastify = require('fastify')
const compressPlugin = require('../index')

// The default `syncThreshold` is derived from host parallelism, so the tests below pin it
// explicitly: `syncThreshold` well above the payload size exercises the buffered path in
// `compressPayloadSync()`, and `syncThreshold: 0` forces the streaming path in `zipStream()`.
const syncThreshold = 32768

// Plain, uncompressed text that the RFC1950 heuristic in `isDeflate()` nevertheless reads as
// deflate: 0x78 0x9c is the most common zlib header, and the check only looks at the first
// two bytes. 66 of the 65536 possible two-byte prefixes match, so roughly 1 in 993 payloads
// of arbitrary bytes trips this.
const falsePositivePayload = Buffer.concat([
  Buffer.from([0x78, 0x9c]),
  Buffer.from('the quick brown fox jumps over the lazy dog '.repeat(94))
])

// Genuinely gzip compressed, and incompressible underneath so it stays above `threshold`
const genuinelyCompressedPayload = zlib.gzipSync(randomBytes(4096))

describe('By default, a payload that looks already compressed is passed through :', async () => {
  test('on the buffered path', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold })

    fastify.get('/', (_request, reply) => {
      reply.type('application/octet-stream').send(falsePositivePayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })

    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.deepEqual(response.rawPayload, falsePositivePayload)
  })

  test('on the streaming path', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold: 0 })

    fastify.get('/', (_request, reply) => {
      reply.type('application/octet-stream').send(falsePositivePayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })

    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.deepEqual(response.rawPayload, falsePositivePayload)
  })
})

describe('When `detectAlreadyCompressed` is false, the payload is compressed regardless :', async () => {
  test('on the buffered path', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold, detectAlreadyCompressed: false })

    fastify.get('/', (_request, reply) => {
      reply.type('application/octet-stream').send(falsePositivePayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })

    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.deepEqual(zlib.gunzipSync(response.rawPayload), falsePositivePayload)
  })

  test('on the streaming path', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold: 0, detectAlreadyCompressed: false })

    fastify.get('/', (_request, reply) => {
      reply.type('application/octet-stream').send(falsePositivePayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })

    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.deepEqual(zlib.gunzipSync(response.rawPayload), falsePositivePayload)
  })

  test('when set per route', async (t) => {
    t.plan(4)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold })

    fastify.get('/forced', {
      compress: { detectAlreadyCompressed: false }
    }, (_request, reply) => {
      reply.type('application/octet-stream').send(falsePositivePayload)
    })

    fastify.get('/default', (_request, reply) => {
      reply.type('application/octet-stream').send(falsePositivePayload)
    })

    const forced = await fastify.inject({
      url: '/forced',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })

    t.assert.equal(forced.headers['content-encoding'], 'gzip')
    t.assert.deepEqual(zlib.gunzipSync(forced.rawPayload), falsePositivePayload)

    // The route option must not leak into the routes that did not set it
    const byDefault = await fastify.inject({
      url: '/default',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })

    t.assert.equal(byDefault.headers['content-encoding'], 'gzip')
    t.assert.deepEqual(byDefault.rawPayload, falsePositivePayload)
  })
})

describe('A genuinely compressed payload is still passed through by default :', async () => {
  test('on the buffered path', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold })

    fastify.get('/', (_request, reply) => {
      reply.type('application/octet-stream').send(genuinelyCompressedPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })

    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.deepEqual(response.rawPayload, genuinelyCompressedPayload)
  })

  test('on the streaming path', async (t) => {
    t.plan(2)

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: true, syncThreshold: 0 })

    fastify.get('/', (_request, reply) => {
      reply.type('application/octet-stream').send(genuinelyCompressedPayload)
    })

    const response = await fastify.inject({
      url: '/',
      method: 'GET',
      headers: { 'accept-encoding': 'gzip' }
    })

    t.assert.equal(response.headers['content-encoding'], 'gzip')
    t.assert.deepEqual(response.rawPayload, genuinelyCompressedPayload)
  })
})
