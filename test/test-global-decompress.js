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

test('should not decompress on missing header', t => {
  t.plan(3)

  const fastify = Fastify()
  fastify.register(compressPlugin)

  fastify.post('/', (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    payload: createPayload()
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.body, 'fastify-compress')
  })
})

test('should skip a identity encoded request payload', t => {
  t.plan(3)

  const fastify = Fastify()
  fastify.register(compressPlugin)

  fastify.post('/', (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'identity'
    },
    payload: createPayload()
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.body, 'fastify-compress')
  })
})

test('should decompress a deflated request payload', t => {
  t.plan(3)

  const fastify = Fastify()
  fastify.register(compressPlugin)

  fastify.post('/', (req, reply) => {
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
  })
})

test('should decompress a gzipped request payload', t => {
  t.plan(3)

  const fastify = Fastify()
  fastify.register(compressPlugin)

  fastify.post('/', (req, reply) => {
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
  })
})

if (zlib.createBrotliCompress) {
  test('should decompress a brotli compressed request payload', t => {
    t.plan(3)

    const fastify = Fastify()
    fastify.register(compressPlugin)
  
    fastify.post('/', (req, reply) => {
      reply.send(req.body.name)
    })
  
    fastify.inject({
      url: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'br'
      },
      payload: createPayload(zlib.createBrotliCompress)
    }, (err, res) => {
      t.error(err)
      t.strictEqual(res.statusCode, 200)
      t.strictEqual(res.body, 'fastify-compress')
    })
  })
}

test('should decompress a request payload forcing the provided algorithm', t => {
  t.plan(3)

  const fastify = Fastify()
  fastify.register(compressPlugin, { forceRequestEncoding: 'gzip' })

  fastify.post('/', (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'deflate'
    },
    payload: createPayload(zlib.createGzip)
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.body, 'fastify-compress')
  })
})

test('should return an error on unsupported encoding', t => {
  t.plan(3)

  const fastify = Fastify()
  fastify.register(compressPlugin)

  fastify.post('/', (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'whatever'
    },
    payload: createPayload(zlib.createDeflate)
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 415)
    t.strictDeepEqual(res.json(), {
      statusCode: 415,
      code: "FST_CP_ERR_INVALID_CONTENT_ENCODING",
      error: "Unsupported Media Type",
      message: "Unsupported Content-Encoding: whatever"
    })
  })
})

test('should return an error on disabled encoding', t => {
  t.plan(3)

  const fastify = Fastify()
  fastify.register(compressPlugin, {requestEncodings: ['br']})

  fastify.post('/', (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'gzip'
    },
    payload: createPayload(zlib.createDeflate)
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 415)
    t.strictDeepEqual(res.json(), {
      statusCode: 415,
      code: "FST_CP_ERR_INVALID_CONTENT_ENCODING",
      error: "Unsupported Media Type",
      message: "Unsupported Content-Encoding: gzip"
    })
  })
})

test('should return an error on invalid compressed payload', t => {
  t.plan(3)

  const fastify = Fastify()
  fastify.register(compressPlugin)

  fastify.post('/', (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'deflate'
    },
    payload: createPayload(zlib.createGzip)
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 400)
    t.strictDeepEqual(res.json(), {
      statusCode: 400,
      code: "FST_CP_ERR_INVALID_CONTENT",
      error: "Bad Request",
      message: "Could not decompress the request payload using the provided encoding"
    })
  })
})

test('should call callback if unsupported encoding', t => {
  t.plan(3)

  const fastify = Fastify()
  fastify.register(compressPlugin, {
    onUnsupportedRequestEncoding(request, encoding) {
      return {
        statusCode: 400,
        code: 'INVALID',
        error: 'Bad Request',
        message: `We don't want to deal with ${encoding}.`
      }
    }
  })

  fastify.post('/', (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'whatever'
    },
    payload: createPayload(zlib.createDeflate)
  }, (err, res) => {
    t.error(err)

    t.strictEqual(res.statusCode, 400)
    t.strictDeepEqual(res.json(), {
      statusCode: 400,
      code: 'INVALID',
      error: 'Bad Request',
      message: `We don't want to deal with whatever.`
    })
  })
})

test('should call callback if invalid payload', t => {
  t.plan(3)

  const fastify = Fastify()
  fastify.register(compressPlugin, {
    onInvalidRequestPayload(request, encoding, error) {
      return {
        statusCode: 400,
        code: 'INVALID',
        error: 'Bad Request',
        message: `What have you sent us? ${encoding} ${error.message}.`
      }
    }
  })

  fastify.post('/', (req, reply) => {
    reply.send(req.body.name)
  })

  fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'deflate'
    },
    payload: createPayload(zlib.createGzip)
  }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 400)
    t.strictDeepEqual(res.json(), {
      statusCode: 400,
      code: 'INVALID',
      error: 'Bad Request',
      message: `What have you sent us? deflate incorrect header check.`
    })
  })
})

test('should validate option requestEncodings', t => {
  t.plan(1)

  const fastify = Fastify()
  fastify.register(compressPlugin, {requestEncodings: []})
  // t.throws(() => )
  // // t.throws(() => fastify.register(compressPlugin, {requestEncodings: ['whatever']}))

  fastify.ready(err => {
    t.equals(err.message, 'The `requestEncodings` option array must have at least 1 item.')
  })
})

test('should make sure at least one encoding is supported', t => {
  t.plan(1)

  const fastify = Fastify()
  fastify.register(compressPlugin, {requestEncodings: ['whatever']})

  fastify.ready(err => {
    t.equals(err.message, 'None of the passed `requestEncodings` were supported — request decompression not possible.')
  })
})

test('should make sure at least one encoding is supported', t => {
  t.plan(1)

  const fastify = Fastify()
  fastify.register(compressPlugin, {forceRequestEncoding: ['whatever']})

  fastify.ready(err => {
    t.equals(err.message, 'Unsupported decompression encoding whatever.')
  })
})
