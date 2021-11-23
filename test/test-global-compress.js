'use strict'

const t = require('tap')
const test = t.test
const zlib = require('zlib')
const AdmZip = require('adm-zip')
const fs = require('fs')
const JSONStream = require('jsonstream')
const { Readable, Writable, PassThrough } = require('stream')
const createReadStream = fs.createReadStream
const readFileSync = fs.readFileSync
const Fastify = require('fastify')
const compressPlugin = require('../index')

test('should send a deflated data', t => {
  t.plan(5)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
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
    t.equal(res.headers.vary, 'accept-encoding')
    t.notOk(res.headers['content-length'], 'no content length')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.inflateSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), file)
  })
})

test('should send a deflated data with custom deflate', t => {
  t.plan(5)
  let usedCustom = false
  const customZlib = { createDeflate: () => (usedCustom = true) && zlib.createDeflate() }

  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, zlib: customZlib })

  fastify.get('/', (req, reply) => {
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
    t.equal(usedCustom, true)
  })
})

test('should send a gzipped data', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
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
  })
})

test('should send a gzipped data if header case varied', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'GZiP'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers['content-encoding'], 'gzip')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), file)
  })
})

test('should send a gzipped data with custom zlib', t => {
  t.plan(4)
  let usedCustom = false
  const customZlib = { createGzip: () => (usedCustom = true) && zlib.createGzip() }
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, zlib: customZlib })

  fastify.get('/', (req, reply) => {
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
    t.equal(usedCustom, true)
  })
})

test('should not double-compress Stream if already zipped', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(
      createReadStream('./package.json')
        .pipe(zlib.createGzip())
    )
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
  })
})

test('should support quality syntax', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(
      createReadStream('./package.json')
        .pipe(zlib.createDeflate())
    )
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip;q=0.5,deflate;q=0.6,identity;q=0.3'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers['content-encoding'], 'deflate')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.inflateSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), file)
  })
})

test('onSend hook should not double-compress Stream if already gzipped', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, {
    global: true,
    threshold: 0
  })

  const file = readFileSync('./package.json', 'utf8')
  fastify.get('/', (req, reply) => {
    const payload = zlib.gzipSync(file)
    reply.type('application/json')
      .header('content-encoding', 'gzip')
      .header('content-length', payload.length)
      .send(payload)
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
    t.equal(res.headers['content-length'], res.rawPayload.length)
    const payload = zlib.gunzipSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), file)
  })
})

test('onSend hook should not double-compress Stream if already brotli compressed', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, {
    global: true,
    threshold: 0
  })

  const file = readFileSync('./package.json', 'utf8')
  fastify.get('/', (req, reply) => {
    const payload = zlib.brotliCompressSync(file)
    reply.type('application/json')
      .header('content-encoding', 'br')
      .header('content-length', payload.length)
      .send(payload)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'br,gzip,deflate'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers['content-encoding'], 'br')
    t.equal(res.headers['content-length'], res.rawPayload.length)
    const payload = zlib.brotliDecompressSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), file)
  })
})

test('should send a gzipped data for * header', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': '*'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers['content-encoding'], 'gzip')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), file)
  })
})

test('should send a gzipped data for multiple * directives', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': '*,*'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers['content-encoding'], 'gzip')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), file)
  })
})

test('should send a brotli data', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'br'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers.vary, 'accept-encoding')
    t.equal(res.headers['content-encoding'], 'br')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.brotliDecompressSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), file)
  })
})

test('should follow the encoding order', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'hello,br,gzip'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers['content-encoding'], 'br')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.brotliDecompressSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), file)
  })
})

test('should sort and follow the custom `encodings` options', (t) => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, {
    global: false,
    encodings: ['gzip', 'br']
  })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject(
    {
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'hello,gzip,br'
      }
    },
    (err, res) => {
      t.error(err)
      t.equal(res.headers['content-encoding'], 'br')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.brotliDecompressSync(res.rawPayload)
      t.equal(payload.toString('utf-8'), file)
    }
  )
})

test('should sort and follow the custom `requestEncodings` options', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, requestEncodings: ['gzip', 'br'] })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'hello,gzip,br'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers['content-encoding'], 'br')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.brotliDecompressSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), file)
  })
})

test('should send uncompressed if unsupported encoding', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'hello'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers.vary, 'accept-encoding')
    t.equal(res.statusCode, 200)
    const file = readFileSync('./package.json', 'utf8')
    t.equal(res.payload, file)
  })
})

test('should call callback if unsupported encoding', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, {
    global: false,
    onUnsupportedEncoding: (encoding, request, reply) => {
      reply.code(406)
      return JSON.stringify({ hello: encoding })
    }
  })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'hello'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 406)
    t.equal(res.headers.vary, 'accept-encoding')
    t.same(JSON.parse(res.payload), { hello: 'hello' })
  })
})

test('should call callback if unsupported encoding and throw error', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, {
    global: false,
    onUnsupportedEncoding: (encoding, request, reply) => {
      reply.code(406)
      throw new Error('testing error')
    }
  })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'hello'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 406)
    t.same(JSON.parse(res.payload), {
      error: 'Not Acceptable',
      message: 'testing error',
      statusCode: 406
    })
  })
})

test('should send uncompressed if unsupported encoding with quality value', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'lzma;q=1.0'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers.vary, 'accept-encoding')
    t.equal(res.statusCode, 200)
    const file = readFileSync('./package.json', 'utf8')
    t.equal(res.payload, file)
  })
})

test('should not compress on missing header', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers.vary, 'accept-encoding')
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
  })
})

test('should decompress compressed Buffers on missing header (deflate)', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0, inflateIfDeflated: true })
  const json = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(zlib.deflateSync(JSON.stringify(json)))
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.same(JSON.parse('' + res.payload), json)
  })
})

test('should decompress compressed Buffers on missing header (gzip)', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0, inflateIfDeflated: true })
  const json = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(zlib.gzipSync(JSON.stringify(json)))
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.same(JSON.parse('' + res.payload), json)
  })
})

test('should decompress data that has been compressed multiple times on missing header', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0, inflateIfDeflated: true })
  const json = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send([0, 1, 2, 3, 4, 5, 6].reduce(
      (x) => zlib.gzipSync(x), JSON.stringify(json)
    ))
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.same(JSON.parse('' + res.payload), json)
  })
})

test('should decompress compressed Streams on missing header (deflate)', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0, inflateIfDeflated: true })

  fastify.get('/', (req, reply) => {
    reply.send(createReadStream('./package.json').pipe(zlib.createDeflate()))
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    const file = readFileSync('./package.json', 'utf8')
    t.equal(res.rawPayload.toString('utf-8'), file)
  })
})

test('should decompress compressed Streams on missing header (gzip)', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0, inflateIfDeflated: true })

  fastify.get('/', (req, reply) => {
    reply.send(createReadStream('./package.json').pipe(zlib.createGzip()))
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    const file = readFileSync('./package.json', 'utf8')
    t.equal(res.rawPayload.toString('utf-8'), file)
  })
})

test('Should close the stream', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    const stream = createReadStream('./package.json')
    stream.on('close', () => t.ok('stream closed'))
    reply.type('text/plain').compress(stream)
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    const file = readFileSync('./package.json', 'utf8')
    t.equal(res.statusCode, 200)
    t.equal(file, res.payload)
  })
})

test('Should send uncompressed on invalid accept encoding - global', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: true })

  fastify.get('/', (req, reply) => {
    reply.header('content-type', 'text/plain')
    reply.send('something')
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'invalid'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.equal(res.payload, 'something')
  })
})

test('should call callback if unsupported encoding - global', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, {
    global: true,
    onUnsupportedEncoding: (encoding, request, reply) => {
      reply.code(406)
      return JSON.stringify({ hello: encoding })
    }
  })

  fastify.get('/', (req, reply) => {
    reply.header('content-type', 'text/plain')
    reply.send(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'hello'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 406)
    t.same(JSON.parse(res.payload), { hello: 'hello' })
  })
})

test('should call callback if unsupported encoding and throw error - global', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, {
    global: true,
    onUnsupportedEncoding: (encoding, request, reply) => {
      reply.code(406)
      throw new Error('testing error')
    }
  })

  fastify.get('/', (req, reply) => {
    reply.header('content-type', 'text/plain')
    reply.send(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'hello'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 406)
    t.same(JSON.parse(res.payload), {
      error: 'Not Acceptable',
      message: 'testing error',
      statusCode: 406
    })
  })
})

test('No compression header', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, threshold: 0 })

  fastify.get('/', (req, reply) => {
    reply.compress({ hello: 'world' })
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'x-no-compression': true
    }
  }, (err, res) => {
    t.error(err)
    const payload = JSON.parse(res.payload)
    t.notOk(res.headers['content-encoding'])
    t.same({ hello: 'world' }, payload)
  })
})

test('Should compress buffer (gzip)', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, threshold: 0 })
  const buf = Buffer.from('hello world')

  fastify.get('/', (req, reply) => {
    reply.compress(buf)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.gunzipSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })
})

test('Should compress buffer (gzip) if header case varied', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, threshold: 0 })
  const buf = Buffer.from('hello world')

  fastify.get('/', (req, reply) => {
    reply.compress(buf)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'GzIp'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.gunzipSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })
})

test('Should compress buffer (deflate)', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, threshold: 0 })
  const buf = Buffer.from('hello world')

  fastify.get('/', (req, reply) => {
    reply.compress(buf)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.inflateSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })
})

test('Should compress buffer (brotli)', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, threshold: 0 })
  const buf = Buffer.from('hello world')

  fastify.get('/', (req, reply) => {
    reply.compress(buf)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'br'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.brotliDecompressSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })
})

test('Should compress buffer (gzip) - global', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })
  const buf = Buffer.from('hello world')

  fastify.get('/', (req, reply) => {
    reply.send(buf)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.gunzipSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })
})

test('Should compress buffer (gzip) with varied header case - global', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })
  const buf = Buffer.from('hello world')

  fastify.get('/', (req, reply) => {
    reply.send(buf)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gZIP'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.gunzipSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })
})

test('Should compress buffer (deflate) - global', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })
  const buf = Buffer.from('hello world')

  fastify.get('/', (req, reply) => {
    reply.send(buf)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.inflateSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })
})

test('Should compress buffer (brotli) - global', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })
  const buf = Buffer.from('hello world')

  fastify.get('/', (req, reply) => {
    reply.send(buf)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'br'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.brotliDecompressSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), buf.toString())
  })
})

test('Should compress json data (gzip)', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, threshold: 0 })
  const json = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.compress(json)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.gunzipSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), JSON.stringify(json))
  })
})

test('Should compress json data (deflate)', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, threshold: 0 })
  const json = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.compress(json)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.inflateSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), JSON.stringify(json))
  })
})

test('Should compress json data (brotli)', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, threshold: 0 })
  const json = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.compress(json)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'br'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.brotliDecompressSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), JSON.stringify(json))
  })
})

test('Should compress string data (gzip)', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, threshold: 0 })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress('hello')
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.gunzipSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), 'hello')
  })
})

test('Should compress string data (deflate)', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, threshold: 0 })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress('hello')
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.inflateSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), 'hello')
  })
})

test('Should compress string data (brotli)', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').send('hello')
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'br'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.brotliDecompressSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), 'hello')
  })
})

test('Missing payload', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    reply.compress()
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    const payload = JSON.parse(res.payload)
    t.equal(res.statusCode, 500)
    t.same({
      error: 'Internal Server Error',
      message: 'Internal server error',
      statusCode: 500
    }, payload)
  })
})

test('Should compress json data (gzip) - global', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })
  const json = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(json)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.gunzipSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), JSON.stringify(json))
  })
})

test('Should not compress on x-no-compression header', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })
  const json = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(json)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'x-no-compression': true
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.same(JSON.parse(res.payload), json)
  })
})

test('Should not compress text/event-stream', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })

  fastify.get('/', (_req, reply) => {
    reply.header('Content-Type', 'text/event-stream')
    const stream = new PassThrough()
    reply.send(stream)
    stream.write('event: open\n\n')
    stream.write('event: change\ndata: schema\n\n')
    stream.end()
  })

  fastify.inject({
    url: '/',
    method: 'GET'
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.same(res.payload, 'event: open\n\nevent: change\ndata: schema\n\n')
  })
})

test('Should decompress compressed payloads on x-no-compression header (deflate)', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0, inflateIfDeflated: true })
  const json = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(zlib.deflateSync(JSON.stringify(json)))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'x-no-compression': true
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.same(JSON.parse('' + res.payload), json)
  })
})

test('Should decompress compressed payloads on x-no-compression header (gzip)', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0, inflateIfDeflated: true })
  const json = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(zlib.gzipSync(JSON.stringify(json)))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'x-no-compression': true
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.same(JSON.parse('' + res.payload), json)
  })
})

test('Should decompress compressed payloads on x-no-compression header (zip)', (t) => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0, inflateIfDeflated: true })
  const json = { hello: 'world' }
  const zip = new AdmZip()
  zip.addFile('file.zip', Buffer.from(JSON.stringify(json), 'utf-8'))

  fastify.get('/', (req, reply) => {
    reply.compress(zip.toBuffer())
  })

  fastify.inject(
    {
      url: '/',
      method: 'GET',
      headers: {
        'x-no-compression': true
      }
    },
    (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.notOk(res.headers['content-encoding'])
      t.same(JSON.parse(res.payload), json)
    }
  )
})

test('Should not try compress missing payload', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })

  fastify.get('/', (req, reply) => {
    reply.send(undefined)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.equal(res.payload, '')
  })
})

test('Should not compress if content-type is an invalid type', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })

  fastify.get('/', (req, reply) => {
    reply.header('content-type', 'something/invalid')
    reply.send('a message')
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.equal(res.payload, 'a message')
  })
})

test('Should not compress if content-type is an invalid type', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })

  fastify.get('/', (req, reply) => {
    reply.type('something/invalid').compress('a message')
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.equal(res.payload, 'a message')
  })
})

test('Should not compress if payload length is smaller than threshold', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 128 })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress('a message')
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.equal(res.payload, 'a message')
  })
})

test('Should compress json data (deflate) - global', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })
  const json = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(json)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.inflateSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), JSON.stringify(json))
  })
})

test('Should compress json data (brotli) - global', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })
  const json = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(json)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'br'
    }
  }, (err, res) => {
    t.error(err)
    const payload = zlib.brotliDecompressSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), JSON.stringify(json))
  })
})

test('Should return a serialized payload when `inflateIfDeflated` is true on x-no-compression header', t => {
  t.plan(8)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0, inflateIfDeflated: true })
  const json = { hello: 'world' }
  const compressedBufferPayload = zlib.brotliCompressSync(Buffer.from(json.toString()))

  fastify.get('/one', (req, reply) => {
    reply.send(json)
  })

  fastify.inject({
    url: '/one',
    method: 'GET',
    headers: {
      'x-no-compression': true
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.same(JSON.parse(res.payload), json)
  })

  fastify.get('/two', (req, reply) => {
    reply.send(compressedBufferPayload)
  })

  fastify.inject({
    url: '/two',
    method: 'GET',
    headers: {
      'x-no-compression': true
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.equal(res.payload, compressedBufferPayload.toString())
  })
})

test('identity header (compress)', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, threshold: 0 })

  fastify.get('/', (req, reply) => {
    reply.compress({ hello: 'world' })
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'identity'
    }
  }, (err, res) => {
    t.error(err)
    const payload = JSON.parse(res.payload)
    t.notOk(res.headers['content-encoding'])
    t.same({ hello: 'world' }, payload)
  })
})

test('identity header and `inflateIfDeflated` is true (compress)', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, threshold: 0, inflateIfDeflated: true })

  fastify.get('/', (req, reply) => {
    reply.compress({ hello: 'world' })
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'identity'
    }
  }, (err, res) => {
    t.error(err)
    const payload = JSON.parse(res.payload)
    t.notOk(res.headers['content-encoding'])
    t.same({ hello: 'world' }, payload)
  })
})

test('identity header (hook)', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })

  fastify.get('/', (req, reply) => {
    reply.send({ hello: 'world' })
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'identity'
    }
  }, (err, res) => {
    t.error(err)
    const payload = JSON.parse(res.payload)
    t.notOk(res.headers['content-encoding'])
    t.same({ hello: 'world' }, payload)
  })
})

test('should support stream1 (reply compress)', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    const stream = JSONStream.stringify()
    reply.type('text/plain').compress(stream)
    stream.write({ hello: 'world' })
    stream.end({ a: 42 })
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
    const payload = zlib.gunzipSync(res.rawPayload)
    t.same(JSON.parse(payload.toString()), [{ hello: 'world' }, { a: 42 }])
  })
})

test('should support stream1 (global hook)', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })

  fastify.get('/', (req, reply) => {
    const stream = JSONStream.stringify()
    reply.type('text/plain').send(stream)
    stream.write({ hello: 'world' })
    stream.end({ a: 42 })
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
    const payload = zlib.gunzipSync(res.rawPayload)
    t.same(JSON.parse(payload.toString()), [{ hello: 'world' }, { a: 42 }])
  })
})

test('accept-encoding can contain white space', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })
  const json = { hello: 'world' }

  fastify.get('/', (req, reply) => {
    reply.send(json)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'hello, gzip'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers['content-encoding'], 'gzip')
    const payload = zlib.gunzipSync(res.rawPayload)
    t.equal(payload.toString('utf-8'), JSON.stringify(json))
  })
})

test('Should remove `content-length` header for a Stream when `inflateIfDeflated` is true on `x-no-compression` header', (t) => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, inflateIfDeflated: true })

  fastify.get('/', (req, reply) => {
    const stream = createReadStream('./package.json')
    reply.type('application/octet-stream').compress(stream)
  })

  fastify.inject(
    {
      url: '/',
      method: 'GET',
      headers: {
        'x-no-compression': true
      }
    },
    (err, res) => {
      t.error(err)
      const file = readFileSync('./package.json', 'utf8')
      t.equal(res.statusCode, 200)
      t.notOk(res.headers['content-length'], 'no content length')
      t.equal(file, res.payload)
    }
  )
})

test('Should add `content-encoding` header for a Stream when `inflateIfDeflated` is true and `encoding` is undefined', (t) => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, inflateIfDeflated: true })

  fastify.get('/', (req, reply) => {
    const stream = createReadStream('./package.json')
    reply.type('application/octet-stream').compress(stream)
  })

  fastify.inject(
    {
      url: '/',
      method: 'GET',
      headers: {
        'accept-encoding': 'identity'
      }
    },
    (err, res) => {
      t.error(err)
      const file = readFileSync('./package.json', 'utf8')
      t.equal(res.statusCode, 200)
      t.equal(res.headers['content-encoding'], 'identity')
      t.equal(file, res.payload)
    }
  )
})

test('Should send an uncompressed Stream and add `content-encoding` header', (t) => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, {
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
  }, (req, reply) => {
    reply.send(createReadStream('./package.json'))
  })

  fastify.inject(
    {
      url: '/',
      method: 'GET',
      headers: {
        accept: 'application/json',
        'accept-encoding': 'identity'
      }
    },
    (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(res.headers['content-encoding'], 'identity')
      const file = readFileSync('./package.json', 'utf-8')
      t.same(res.payload, file)
    }
  )
})

test('compress should remove content-length', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    fs.readFile('./package.json', 'utf8', (err, data) => {
      if (err) {
        return reply.send(err)
      }
      reply.type('text/plain').header('content-length', '' + data.length).compress(data)
    })
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
  })
})

test('onSend hook should remove content-length', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: true })

  fastify.get('/', (req, reply) => {
    fs.readFile('./package.json', 'utf8', (err, data) => {
      if (err) {
        return reply.send(err)
      }
      reply.type('text/plain').header('content-length', '' + data.length).send(data)
    })
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
  })
})

test('Should not compress if content is not detected as a compressible type when a reply `Content-Type` header is not set', t => {
  t.plan(3)
  const fastify = Fastify()
  const json = { hello: 'world' }

  fastify.register(compressPlugin, { threshold: 0 })

  fastify.addHook('onSend', async (req, res) => {
    res.header('content-type', undefined)
  })

  fastify.get('/', (req, reply) => {
    reply.compress(json)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      accept: 'application/json',
      'accept-encoding': 'identity'
    }
  }, (err, res) => {
    t.error(err)
    t.notOk(res.headers['content-encoding'])
    t.equal(res.payload, JSON.stringify(json))
  })
})

test('Should compress if customTypes is set and matches content type', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { customTypes: /x-user-header$/ })

  fastify.get('/', (req, reply) => {
    reply.type('application/x-user-header').send(createReadStream('./package.json'))
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
  })
})

test('Should not compress if customTypes is set and does not match content type or mime-db', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { customTypes: /x-user-header$/ })

  fastify.get('/', (req, reply) => {
    reply.type('application/x-other-type').send(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  }, (err, res) => {
    t.error(err)
    t.notOk(res.headers['content-encoding'])
    t.equal(res.statusCode, 200)
  })
})

test('Should not apply customTypes if value passed is not RegExp', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { customTypes: 'x-user-header' })

  fastify.get('/', (req, reply) => {
    reply.type('application/x-user-header').send(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  }, (err, res) => {
    t.error(err)
    t.notOk(res.headers['content-encoding'])
    t.equal(res.statusCode, 200)
  })
})

test('Should only use `encodings` if passed', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { encodings: ['deflate'] })

  fastify.get('/', (req, reply) => {
    reply.send(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'br,gzip,deflate'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers['content-encoding'], 'deflate')
    t.equal(res.statusCode, 200)
  })
})

test('Should error if `encodings` array is empty', t => {
  t.plan(1)
  const fastify = Fastify()

  fastify.register(compressPlugin, { encodings: [] })

  fastify.ready(err => {
    t.ok(err instanceof Error)
  })
})

test('Should error if no entries in `encodings` are supported', t => {
  t.plan(1)
  const fastify = Fastify()

  fastify.register(compressPlugin, {
    encodings: ['(not-a-real-encoding)']
  })

  fastify.ready(err => {
    t.ok(err instanceof Error)
  })
})

test('Should not compress mime types with undefined compressible values', t => {
  t.plan(4)
  const fastify = Fastify()
  fastify.register(compressPlugin, { threshold: 0 })

  fastify.get('/', (req, reply) => {
    reply.type('image/webp').send('hello')
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip, deflate, br'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.equal(res.payload, 'hello')
  })
})

test('Should send data compressed according to brotliOptions', t => {
  t.plan(3)
  const fastify = Fastify()
  const brotliOptions = {
    params: {
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
      [zlib.constants.BROTLI_PARAM_QUALITY]: 4
    }
  }

  fastify.register(compressPlugin, {
    global: false,
    brotliOptions
  })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'br'
    }
  }, (err, res) => {
    t.error(err)
    t.equal(res.headers['content-encoding'], 'br')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.brotliDecompressSync(res.rawPayload, brotliOptions)
    t.equal(payload.toString('utf-8'), file)
  })
})

test('Should send data deflated according to zlibOptions', t => {
  t.plan(3)
  const fastify = Fastify()
  const zlibOptions = {
    level: 1,
    dictionary: Buffer.from('fastifycompress')
  }

  fastify.register(compressPlugin, {
    global: false,
    zlibOptions
  })

  fastify.get('/', (req, reply) => {
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
    const fileBuffer = readFileSync('./package.json')
    t.same(res.rawPayload, zlib.deflateSync(fileBuffer, zlibOptions))
  })
})

test('Should send data gzipped according to zlibOptions', t => {
  t.plan(3)
  const fastify = Fastify()
  const zlibOptions = {
    level: 1
  }

  fastify.register(compressPlugin, {
    global: false,
    zlibOptions
  })

  fastify.get('/', (req, reply) => {
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
    const fileBuffer = readFileSync('./package.json')
    t.same(res.rawPayload, zlib.gzipSync(fileBuffer, zlibOptions))
  })
})

test('stream onEnd handler should log an error if exists', t => {
  t.plan(1)

  let actual = null
  const logger = new Writable({
    write (chunk, encoding, callback) {
      actual = JSON.parse(chunk.toString())
      callback()
    }
  })

  const fastify = Fastify({
    global: false,
    logger: {
      level: 'error',
      stream: logger
    }
  })

  fastify.register(compressPlugin)

  const expect = new Error('something wrong')

  fastify.get('/', (req, reply) => {
    const stream = new Readable({
      read (size) {
        this.destroy(expect)
      }
    })
    reply.type('text/plain').compress(stream)
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  }, (_, res) => {
    t.equal(actual.msg, expect.message)
  })
})

test('should concat accept-encoding to vary header if present', t => {
  t.plan(4)
  const fastify = Fastify()

  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    reply.header('vary', 'different-header')
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.get('/foo', (req, reply) => {
    reply.header('vary', ['different-header', 'my-header'])
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
    t.same(res.headers.vary, 'different-header, accept-encoding')
  })

  fastify.inject({
    url: '/foo',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, res) => {
    t.error(err)
    t.same(res.headers.vary, 'different-header, my-header, accept-encoding')
  })
})

test('should not add accept-encoding to vary header if already present', t => {
  t.plan(4)
  const fastify = Fastify()

  fastify.register(compressPlugin, { global: false })

  fastify.get('/', (req, reply) => {
    reply.header('vary', 'accept-encoding,different-header')
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.get('/foo', (req, reply) => {
    reply.header('vary', 'accept-encoding, different-header, my-header')
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
    t.same(res.headers.vary, 'accept-encoding,different-header')
  })

  fastify.inject({
    url: '/foo',
    method: 'GET',
    headers: {
      'accept-encoding': 'deflate'
    }
  }, (err, res) => {
    t.error(err)
    t.same(res.headers.vary, 'accept-encoding, different-header, my-header')
  })
})

test('Should correctly add onRequest hooks', (t) => {
  t.plan(17)
  const fastify = Fastify()

  fastify.addHook('onRequest', async (request, reply) => {
    reply.header('x-fastify-global-test', 'ok')
  })

  fastify.register(compressPlugin, { global: true, threshold: 0 })

  fastify.get(
    '/one',
    {
      onRequest: [
        async (request, reply) => {
          reply.header('x-fastify-test-one', 'ok')
        }
      ]
    },
    (req, reply) => {
      reply.type('text/plain').compress(createReadStream('./package.json'))
    }
  )

  fastify.inject(
    {
      url: '/one',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    },
    (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.notOk(res.headers['content-length'], 'no content length')
      t.equal(res.headers['x-fastify-global-test'], 'ok')
      t.equal(res.headers['x-fastify-test-one'], 'ok')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.inflateSync(res.rawPayload)
      t.equal(payload.toString('utf-8'), file)
    }
  )

  fastify.get(
    '/two',
    {
      onRequest: async (request, reply) => {
        reply.header('x-fastify-test-two', 'ok')
      }
    },
    (req, reply) => {
      reply.type('text/plain').compress(createReadStream('./package.json'))
    }
  )

  fastify.inject(
    {
      url: '/two',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    },
    (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.notOk(res.headers['content-length'], 'no content length')
      t.equal(res.headers['x-fastify-global-test'], 'ok')
      t.equal(res.headers['x-fastify-test-two'], 'ok')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.inflateSync(res.rawPayload)
      t.equal(payload.toString('utf-8'), file)
    }
  )

  fastify.get(
    '/three',
    {
      onRequest: null
    },
    (req, reply) => {
      reply.type('text/plain').compress(createReadStream('./package.json'))
    }
  )

  fastify.inject(
    {
      url: '/three',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    },
    (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.notOk(res.headers['content-length'], 'no content length')
      t.equal(res.headers['x-fastify-global-test'], 'ok')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.inflateSync(res.rawPayload)
      t.equal(payload.toString('utf-8'), file)
    }
  )
})

test('Should correctly add onSend hooks', (t) => {
  t.plan(17)
  const fastify = Fastify()

  fastify.addHook('onSend', async (request, reply) => {
    reply.header('x-fastify-global-test', 'ok')
  })

  fastify.register(compressPlugin, { global: true, threshold: 0 })

  fastify.get(
    '/one',
    {
      onSend: [
        async (request, reply) => {
          reply.header('x-fastify-test-one', 'ok')
        }
      ]
    },
    (req, reply) => {
      reply.type('text/plain').compress(createReadStream('./package.json'))
    }
  )

  fastify.inject(
    {
      url: '/one',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    },
    (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.notOk(res.headers['content-length'], 'no content length')
      t.equal(res.headers['x-fastify-global-test'], 'ok')
      t.equal(res.headers['x-fastify-test-one'], 'ok')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.inflateSync(res.rawPayload)
      t.equal(payload.toString('utf-8'), file)
    }
  )

  fastify.get(
    '/two',
    {
      onSend: async (request, reply) => {
        reply.header('x-fastify-test-two', 'ok')
      }
    },
    (req, reply) => {
      reply.type('text/plain').compress(createReadStream('./package.json'))
    }
  )

  fastify.inject(
    {
      url: '/two',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    },
    (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.notOk(res.headers['content-length'], 'no content length')
      t.equal(res.headers['x-fastify-global-test'], 'ok')
      t.equal(res.headers['x-fastify-test-two'], 'ok')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.inflateSync(res.rawPayload)
      t.equal(payload.toString('utf-8'), file)
    }
  )

  fastify.get(
    '/three',
    {
      onSend: null
    },
    (req, reply) => {
      reply.type('text/plain').compress(createReadStream('./package.json'))
    }
  )

  fastify.inject(
    {
      url: '/three',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    },
    (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.notOk(res.headers['content-length'], 'no content length')
      t.equal(res.headers['x-fastify-global-test'], 'ok')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.inflateSync(res.rawPayload)
      t.equal(payload.toString('utf-8'), file)
    }
  )
})

test('Should correctly add preParsing hooks', (t) => {
  t.plan(17)
  const fastify = Fastify()

  fastify.addHook('preParsing', async (request, reply) => {
    reply.header('x-fastify-global-test', 'ok')
  })

  fastify.register(compressPlugin, { global: true, threshold: 0 })

  fastify.get(
    '/one',
    {
      preParsing: [
        async (request, reply) => {
          reply.header('x-fastify-test-one', 'ok')
        }
      ]
    },
    (req, reply) => {
      reply.type('text/plain').compress(createReadStream('./package.json'))
    }
  )

  fastify.inject(
    {
      url: '/one',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    },
    (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.notOk(res.headers['content-length'], 'no content length')
      t.equal(res.headers['x-fastify-global-test'], 'ok')
      t.equal(res.headers['x-fastify-test-one'], 'ok')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.inflateSync(res.rawPayload)
      t.equal(payload.toString('utf-8'), file)
    }
  )

  fastify.get(
    '/two',
    {
      preParsing: async (request, reply) => {
        reply.header('x-fastify-test-two', 'ok')
      }
    },
    (req, reply) => {
      reply.type('text/plain').compress(createReadStream('./package.json'))
    }
  )

  fastify.inject(
    {
      url: '/two',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    },
    (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.notOk(res.headers['content-length'], 'no content length')
      t.equal(res.headers['x-fastify-global-test'], 'ok')
      t.equal(res.headers['x-fastify-test-two'], 'ok')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.inflateSync(res.rawPayload)
      t.equal(payload.toString('utf-8'), file)
    }
  )

  fastify.get(
    '/three',
    {
      preParsing: null
    },
    (req, reply) => {
      reply.type('text/plain').compress(createReadStream('./package.json'))
    }
  )

  fastify.inject(
    {
      url: '/three',
      method: 'GET',
      headers: {
        'accept-encoding': 'deflate'
      }
    },
    (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.notOk(res.headers['content-length'], 'no content length')
      t.equal(res.headers['x-fastify-global-test'], 'ok')
      const file = readFileSync('./package.json', 'utf8')
      const payload = zlib.inflateSync(res.rawPayload)
      t.equal(payload.toString('utf-8'), file)
    }
  )
})
