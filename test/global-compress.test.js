'use strict'

const { test } = require('tap')
const { createReadStream, readFile, readFileSync } = require('fs')
const { Readable, Writable, PassThrough } = require('stream')
const zlib = require('zlib')
const AdmZip = require('adm-zip')
const JSONStream = require('jsonstream')
const Fastify = require('fastify')
const compressPlugin = require('../index')

test('It should send a deflated data', async (t) => {
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

test('It should send a deflated data with custom deflate', async (t) => {
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

test('It should send a gzipped data', async (t) => {
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

test('It should send a gzipped data if header case varied', async (t) => {
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

test('It should send a gzipped data with custom zlib', async (t) => {
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

test('It should not double-compress Stream if already zipped', async (t) => {
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

test('It should support quality syntax', async (t) => {
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

test('onSend hook should not double-compress Stream if already gzipped', async (t) => {
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

test('onSend hook should not double-compress Stream if already brotli compressed', async (t) => {
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

test('It should send a gzipped data for * header', async (t) => {
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

test('It should send a gzipped data for multiple * directives', async (t) => {
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

test('It should send a brotli data', async (t) => {
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

test('It should follow the encoding order', async (t) => {
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
      'accept-encoding': 'hello,br,gzip'
    }
  })
  const file = readFileSync('./package.json', 'utf8')
  const payload = zlib.brotliDecompressSync(response.rawPayload)
  t.equal(response.headers['content-encoding'], 'br')
  t.equal(payload.toString('utf-8'), file)
})

test('It should sort and follow the custom `encodings` options', async (t) => {
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

test('It should sort and follow the custom `requestEncodings` options', async (t) => {
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

test('It should send uncompressed if unsupported encoding', async (t) => {
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
      'accept-encoding': 'hello'
    }
  })
  const file = readFileSync('./package.json', 'utf8')
  t.equal(response.headers.vary, 'accept-encoding')
  t.equal(response.statusCode, 200)
  t.equal(response.payload, file)
})

test('It should call callback if unsupported encoding', async (t) => {
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

test('It should call callback if unsupported encoding and throw error', async (t) => {
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

test('It should send uncompressed if unsupported encoding with quality value', async (t) => {
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

test('It should not compress on missing header', async (t) => {
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

test('It should decompress compressed Buffers on missing header with the fallback zlib.createInflate (deflate)', async (t) => {
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

test('It should decompress compressed Buffers on missing header with the fallback zlib.createGunzip (gzip)', async (t) => {
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

test('It should decompress compressed Buffers on missing header (deflate)', async (t) => {
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

test('It should decompress compressed Buffers on missing header (gzip)', async (t) => {
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

test('It should decompress data that has been compressed multiple times on missing header', async (t) => {
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

test('It should decompress compressed Streams on missing header (deflate)', async (t) => {
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

test('It should decompress compressed Streams on missing header (gzip)', async (t) => {
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

test('Should close the stream', (t) => {
  t.plan(4)

  const fastify = Fastify()
  fastify.register(compressPlugin, { global: true })

  fastify.get('/', (request, reply) => {
    const stream = createReadStream('./package.json')
    stream.on('close', () => t.ok('stream closed'))

    reply
      .type('text/plain')
      .compress(stream)
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, response) => {
    t.error(err)

    const file = readFileSync('./package.json', 'utf8')
    t.equal(response.statusCode, 200)
    t.equal(file, response.payload)
  })
})

test('Should send uncompressed on invalid accept encoding - global', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { global: true })

  fastify.get('/', (request, reply) => {
    reply
      .header('content-type', 'text/plain')
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

test('It should call callback if unsupported encoding - global', async (t) => {
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
      .header('content-type', 'text/plain')
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

test('It should call callback if unsupported encoding and throw error - global', async (t) => {
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
      .header('content-type', 'text/plain')
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

test('No compression header', async (t) => {
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
      'x-no-compression': true
    }
  })
  const payload = JSON.parse(response.payload)
  t.notOk(response.headers['content-encoding'])
  t.same({ hello: 'world' }, payload)
})

test('Should compress buffer (gzip)', async (t) => {
  t.plan(1)

  const fastify = Fastify()
  fastify.register(compressPlugin, { global: true, threshold: 0 })

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

test('Should compress buffer (gzip) if header case varied', async (t) => {
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

test('Should compress buffer (deflate)', async (t) => {
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

test('Should compress buffer (brotli)', async (t) => {
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

test('Should compress buffer (gzip) - global', async (t) => {
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

test('Should compress buffer (gzip) with varied header case - global', async (t) => {
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
      'accept-encoding': 'gZIP'
    }
  })
  const payload = zlib.gunzipSync(response.rawPayload)
  t.equal(payload.toString('utf-8'), buf.toString())
})

test('Should compress buffer (deflate) - global', async (t) => {
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

test('Should compress buffer (brotli) - global', async (t) => {
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

test('Should compress json data (gzip)', async (t) => {
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

test('Should compress json data (deflate)', async (t) => {
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

test('Should compress json data (brotli)', async (t) => {
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

test('Should compress string data (gzip)', async (t) => {
  t.plan(1)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { global: true, threshold: 0 })

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

test('Should compress string data (deflate)', async (t) => {
  t.plan(1)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { global: true, threshold: 0 })

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

test('Should compress json data with the fallback zlib.createBrotliCompress (brotli)', async (t) => {
  t.plan(1)

  const fastify = Fastify()
  await fastify.register(compressPlugin, {
    global: true,
    threshold: 0,
    zlib: true // will trigger a fallback on the default zlib.createBrotliCompress
  })

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

test('Should compress string data with the fallback zlib.createGzip (gzip)', async (t) => {
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

test('Should compress string data with the fallback zlib.createDeflate (deflate)', async (t) => {
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

test('Should compress string data (brotli)', async (t) => {
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

test('Missing payload', async (t) => {
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

test('Should compress json data (gzip) - global', async (t) => {
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

test('Should not compress on x-no-compression header', async (t) => {
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

test('Should not compress text/event-stream', async (t) => {
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

test('Should decompress compressed payloads on x-no-compression header (deflate)', async (t) => {
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

test('Should decompress compressed payloads on x-no-compression header (gzip)', async (t) => {
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

test('Should decompress compressed payloads on x-no-compression header (zip)', async (t) => {
  t.plan(3)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { threshold: 0, inflateIfDeflated: true })

  const json = { hello: 'world' }
  const zip = new AdmZip()
  zip.addFile('file.zip', Buffer.from(JSON.stringify(json), 'utf-8'))

  fastify.get('/', (request, reply) => {
    reply.compress(zip.toBuffer())
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

test('Should not try compress missing payload', async (t) => {
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

test('Should not compress if content-type is an invalid type (header)', async (t) => {
  t.plan(3)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { threshold: 0 })

  fastify.get('/', (request, reply) => {
    reply
      .header('content-type', 'something/invalid')
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

test('Should not compress if content-type is an invalid type', async (t) => {
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

test('Should not compress if payload length is smaller than threshold', async (t) => {
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

test('Should compress json data when global is `true` by default', async (t) => {
  t.test('Should compress json data (deflate) - global', async (t) => {
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

  t.test('Should compress json data (brotli) - global', async (t) => {
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
})

test('Should return a serialized payload when `inflateIfDeflated` is true on x-no-compression header', (t) => {
  t.plan(8)

  const fastify = Fastify()
  fastify.register(compressPlugin, {
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

  fastify.inject({
    url: '/one',
    method: 'GET',
    headers: {
      'x-no-compression': true
    }
  }, (err, response) => {
    t.error(err)

    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-encoding'])
    t.same(JSON.parse(response.payload), json)
  })

  fastify.inject({
    url: '/two',
    method: 'GET',
    headers: {
      'x-no-compression': true
    }
  }, (err, response) => {
    t.error(err)

    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-encoding'])
    t.equal(response.payload, compressedBufferPayload.toString())
  })
})

test('identity header (compress)', async (t) => {
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

test('identity header and `inflateIfDeflated` is true (compress)', async (t) => {
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

test('identity header (hook)', async (t) => {
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

test('It should support stream1 (reply compress)', async (t) => {
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

test('It should support stream1 (global hook)', async (t) => {
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

test('accept-encoding can contain white space', async (t) => {
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

test('Should remove `content-length` header for a Stream when `inflateIfDeflated` is true on `x-no-compression` header', async (t) => {
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

test('Should add `content-encoding` header for a Stream when `inflateIfDeflated` is true and `encoding` is undefined', async (t) => {
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

test('Should send an uncompressed Stream and add `content-encoding` header', async (t) => {
  t.plan(3)

  const fastify = Fastify()
  await fastify.register(compressPlugin, {
    global: true,
    inflateIfDeflated: true,
    encodings: ['deflate', 'gzip']
  })

  fastify.get('/', {
    compress: {
      encodings: ['gzip'],
      inflateIfDeflated: true,
      threshold: 0
    }
  }, (request, reply) => {
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

test('compress should remove content-length', async (t) => {
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

test('onSend hook should remove content-length', async (t) => {
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

test('Should not compress if content is not detected as a compressible type when a reply `Content-Type` header is not set', async (t) => {
  t.plan(2)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { threshold: 0 })

  fastify.addHook('onSend', async (request, response) => {
    response.header('content-type', undefined)
  })

  const json = { hello: 'world' }

  fastify.get('/', (request, reply) => {
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

test('Should compress if customTypes is set and matches content type', async (t) => {
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

test('Should not compress if customTypes is set and does not match content type or mime-db', async (t) => {
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

test('Should not apply customTypes if value passed is not RegExp', async (t) => {
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

test('Should only use `encodings` if passed', async (t) => {
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

test('Should error if `encodings` array is empty', (t) => {
  t.plan(1)

  const fastify = Fastify()
  fastify.register(compressPlugin, { encodings: [] })

  fastify.ready(err => {
    t.ok(err instanceof Error)
  })
})

test('Should error if no entries in `encodings` are supported', (t) => {
  t.plan(1)

  const fastify = Fastify()
  fastify.register(compressPlugin, {
    encodings: ['(not-a-real-encoding)']
  })

  fastify.ready(err => {
    t.ok(err instanceof Error)
  })
})

test('Should not compress mime types with undefined compressible values', async (t) => {
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

test('Should send data compressed according to brotliOptions', async (t) => {
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

test('Should send data deflated according to zlibOptions', async (t) => {
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

test('Should send data gzipped according to zlibOptions', async (t) => {
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

test('stream onEnd handler should log an error if exists', (t) => {
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
  fastify.register(compressPlugin)

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

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  }, (_, response) => {
    t.equal(actual.msg, expect.message)
  })
})

test('It should concat accept-encoding to vary header if present', (t) => {
  t.plan(4)

  const fastify = Fastify()
  fastify.register(compressPlugin, { global: true })

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

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, response) => {
    t.error(err)

    t.same(response.headers.vary, 'different-header, accept-encoding')
  })

  fastify.inject({
    url: '/foo',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, response) => {
    t.error(err)

    t.same(response.headers.vary, 'different-header, my-header, accept-encoding')
  })
})

test('It should not add accept-encoding to vary header if already present', (t) => {
  t.plan(4)

  const fastify = Fastify()
  fastify.register(compressPlugin, { global: true })

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

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, response) => {
    t.error(err)

    t.same(response.headers.vary, 'accept-encoding,different-header')
  })

  fastify.inject({
    url: '/foo',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, response) => {
    t.error(err)

    t.same(response.headers.vary, 'accept-encoding, different-header, my-header')
  })
})

test('Should correctly add onRequest hooks', (t) => {
  t.plan(17)

  const fastify = Fastify()

  fastify.addHook('onRequest', async (request, reply) => {
    reply.header('x-fastify-global-test', 'ok')
  })

  fastify.register(compressPlugin, { global: true, threshold: 0 })

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

  fastify.inject(
    {
      url: '/one',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    },
    (err, response) => {
      t.error(err)

      const payload = zlib.inflateSync(response.rawPayload)
      t.equal(response.statusCode, 200)
      t.notOk(response.headers['content-length'], 'no content length')
      t.equal(response.headers['x-fastify-global-test'], 'ok')
      t.equal(response.headers['x-fastify-test-one'], 'ok')
      t.equal(payload.toString('utf-8'), file)
    }
  )

  fastify.inject({
    url: '/two',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, response) => {
    t.error(err)

    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(response.headers['x-fastify-global-test'], 'ok')
    t.equal(response.headers['x-fastify-test-two'], 'ok')
    t.equal(payload.toString('utf-8'), file)
  })

  fastify.inject({
    url: '/three',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, response) => {
    t.error(err)

    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(response.headers['x-fastify-global-test'], 'ok')
    t.equal(payload.toString('utf-8'), file)
  })
})

test('Should correctly add onSend hooks', (t) => {
  t.plan(17)

  const fastify = Fastify()

  fastify.addHook('onSend', async (request, reply) => {
    reply.header('x-fastify-global-test', 'ok')
  })

  fastify.register(compressPlugin, { global: true, threshold: 0 })

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

  fastify.inject({
    url: '/one',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, response) => {
    t.error(err)

    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(response.headers['x-fastify-global-test'], 'ok')
    t.equal(response.headers['x-fastify-test-one'], 'ok')
    t.equal(payload.toString('utf-8'), file)
  })

  fastify.inject({
    url: '/two',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, response) => {
    t.error(err)

    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(response.headers['x-fastify-global-test'], 'ok')
    t.equal(response.headers['x-fastify-test-two'], 'ok')
    t.equal(payload.toString('utf-8'), file)
  })

  fastify.inject({
    url: '/three',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, response) => {
    t.error(err)

    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(response.headers['x-fastify-global-test'], 'ok')
    t.equal(payload.toString('utf-8'), file)
  })
})

test('Should correctly add preParsing hooks', (t) => {
  t.plan(17)

  const file = readFileSync('./package.json', 'utf8')

  const fastify = Fastify()

  fastify.addHook('preParsing', async (request, reply) => {
    reply.header('x-fastify-global-test', 'ok')
  })

  fastify.register(compressPlugin, { global: true, threshold: 0 })

  fastify.get('/one', {
    preParsing: [
      async (request, reply) => { reply.header('x-fastify-test-one', 'ok') }
    ]
  }, (request, reply) => {
    reply
      .type('text/plain')
      .compress(createReadStream('./package.json'))
  })

  fastify.get('/two', {
    preParsing: async (request, reply) => {
      reply.header('x-fastify-test-two', 'ok')
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

  fastify.inject({
    url: '/one',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, response) => {
    t.error(err)

    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(response.headers['x-fastify-global-test'], 'ok')
    t.equal(response.headers['x-fastify-test-one'], 'ok')
    t.equal(payload.toString('utf-8'), file)
  })

  fastify.inject({
    url: '/two',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, response) => {
    t.error(err)

    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(response.headers['x-fastify-global-test'], 'ok')
    t.equal(response.headers['x-fastify-test-two'], 'ok')
    t.equal(payload.toString('utf-8'), file)
  })

  fastify.inject({
    url: '/three',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, response) => {
    t.error(err)

    const payload = zlib.inflateSync(response.rawPayload)
    t.equal(response.statusCode, 200)
    t.notOk(response.headers['content-length'], 'no content length')
    t.equal(response.headers['x-fastify-global-test'], 'ok')
    t.equal(payload.toString('utf-8'), file)
  })
})
