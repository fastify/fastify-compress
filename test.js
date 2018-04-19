'use strict'

const t = require('tap')
const test = t.test
const brotli = require('iltorb')
const zlib = require('zlib')
const fs = require('fs')
const JSONStream = require('jsonstream')
const createReadStream = fs.createReadStream
const readFileSync = fs.readFileSync
const Fastify = require('fastify')
const compressPlugin = require('./index')

test('should send a deflated data', t => {
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
      'accept-encoding': 'deflate'
    }
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.headers['content-encoding'], 'deflate')
    t.notOk(res.headers['content-length'], 'no content length')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.inflateSync(res.rawPayload)
    t.strictEqual(payload.toString('utf-8'), file)
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
    t.strictEqual(res.headers['content-encoding'], 'gzip')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(res.rawPayload)
    t.strictEqual(payload.toString('utf-8'), file)
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
    t.strictEqual(res.headers['content-encoding'], 'gzip')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.gunzipSync(res.rawPayload)
    t.strictEqual(payload.toString('utf-8'), file)
  })
})

test('should send a brotli data', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { brotli, global: false })

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
    t.strictEqual(res.headers['content-encoding'], 'br')
    const file = readFileSync('./package.json', 'utf8')
    const payload = brotli.decompressSync(res.rawPayload)
    t.strictEqual(payload.toString('utf-8'), file)
  })
})

test('should follow the encoding order', t => {
  t.plan(3)
  const fastify = Fastify()
  fastify.register(compressPlugin, { brotli, global: false })

  fastify.get('/', (req, reply) => {
    reply.type('text/plain').compress(createReadStream('./package.json'))
  })

  fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'hello,br'
    }
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.headers['content-encoding'], 'br')
    const file = readFileSync('./package.json', 'utf8')
    const payload = brotli.decompressSync(res.rawPayload)
    t.strictEqual(payload.toString('utf-8'), file)
  })
})

test('Unsupported encoding', t => {
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
      'accept-encoding': 'hello'
    }
  }, (err, res) => {
    t.error(err)
    const payload = JSON.parse(res.payload)
    t.strictEqual(res.statusCode, 406)
    t.deepEqual({
      error: 'Not Acceptable',
      message: 'Unsupported encoding',
      statusCode: 406
    }, payload)
  })
})

test('should not compress on missing header', t => {
  t.plan(3)
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
    t.strictEqual(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
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
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(file, res.payload)
  })
})

test('Should send 406 error on invalid accept encoding', t => {
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
    const payload = JSON.parse(res.payload)
    t.strictEqual(res.statusCode, 406)
    t.deepEqual({
      error: 'Not Acceptable',
      message: 'Unsupported encoding',
      statusCode: 406
    }, payload)
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
    t.deepEqual({ hello: 'world' }, payload)
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
    t.strictEqual(payload.toString('utf-8'), JSON.stringify(json))
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
    t.strictEqual(payload.toString('utf-8'), JSON.stringify(json))
  })
})

test('Should compress json data (brotli)', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { global: false, brotli, threshold: 0 })
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
    const payload = brotli.decompressSync(res.rawPayload)
    t.strictEqual(payload.toString('utf-8'), JSON.stringify(json))
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
    t.strictEqual(payload.toString('utf-8'), 'hello')
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
    t.strictEqual(payload.toString('utf-8'), 'hello')
  })
})

test('Should compress string data (brotli)', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { brotli, threshold: 0 })

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
    const payload = brotli.decompressSync(res.rawPayload)
    t.strictEqual(payload.toString('utf-8'), 'hello')
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
    t.strictEqual(res.statusCode, 500)
    t.deepEqual({
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
    t.strictEqual(payload.toString('utf-8'), JSON.stringify(json))
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
    t.strictEqual(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.deepEqual(JSON.parse(res.payload), json)
  })
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
    t.strictEqual(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.strictEqual(res.payload, '')
  })
})

test('Should not compress if content-type is a invalid type', t => {
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
    t.strictEqual(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.strictEqual(res.payload, 'a message')
  })
})

test('Should not compress if content-type is a invalid type', t => {
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
    t.strictEqual(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.strictEqual(res.payload, 'a message')
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
    t.strictEqual(res.statusCode, 200)
    t.notOk(res.headers['content-encoding'])
    t.strictEqual(res.payload, 'a message')
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
    t.strictEqual(payload.toString('utf-8'), JSON.stringify(json))
  })
})

test('Should compress json data (brotli) - global', t => {
  t.plan(2)
  const fastify = Fastify()
  fastify.register(compressPlugin, { brotli, threshold: 0 })
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
    const payload = brotli.decompressSync(res.rawPayload)
    t.strictEqual(payload.toString('utf-8'), JSON.stringify(json))
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
    t.deepEqual({ hello: 'world' }, payload)
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
    t.deepEqual({ hello: 'world' }, payload)
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
    t.strictEqual(res.headers['content-encoding'], 'gzip')
    const payload = zlib.gunzipSync(res.rawPayload)
    t.deepEqual(JSON.parse(payload.toString()), [{ hello: 'world' }, { a: 42 }])
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
    t.strictEqual(res.headers['content-encoding'], 'gzip')
    const payload = zlib.gunzipSync(res.rawPayload)
    t.deepEqual(JSON.parse(payload.toString()), [{ hello: 'world' }, { a: 42 }])
  })
})

test('should ignore br header if brotli option not set', t => {
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
      'accept-encoding': 'br,gzip'
    }
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.headers['content-encoding'], 'gzip')
    const payload = zlib.gunzipSync(res.rawPayload)
    t.strictEqual(payload.toString('utf-8'), JSON.stringify(json))
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
    t.strictEqual(res.headers['content-encoding'], 'gzip')
    const payload = zlib.gunzipSync(res.rawPayload)
    t.strictEqual(payload.toString('utf-8'), JSON.stringify(json))
  })
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
    t.strictEqual(res.headers['content-encoding'], 'deflate')
    t.notOk(res.headers['content-length'], 'no content length')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.inflateSync(res.rawPayload)
    t.strictEqual(payload.toString('utf-8'), file)
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
    t.strictEqual(res.headers['content-encoding'], 'deflate')
    t.notOk(res.headers['content-length'], 'no content length')
    const file = readFileSync('./package.json', 'utf8')
    const payload = zlib.inflateSync(res.rawPayload)
    t.strictEqual(payload.toString('utf-8'), file)
  })
})
