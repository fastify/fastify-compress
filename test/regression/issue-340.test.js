'use strict'

const { test } = require('node:test')
const zlib = require('node:zlib')
const Fastify = require('fastify')
const fastifyCompress = require('../..')

test('global onUnsupportedRequestEncoding should be used when route only overrides onInvalidRequestPayload', async (t) => {
  let globalCalled = false

  const fastify = Fastify()
  await fastify.register(fastifyCompress, {
    global: true,
    onUnsupportedRequestEncoding: () => {
      globalCalled = true
      return { statusCode: 415, code: 'CUSTOM_GLOBAL', message: 'global unsupported' }
    },
    onInvalidRequestPayload: () => {
      return { statusCode: 400, code: 'CUSTOM_GLOBAL', message: 'global invalid' }
    }
  })

  fastify.post('/', {
    decompress: {
      onInvalidRequestPayload: () => {
        return { statusCode: 400, code: 'CUSTOM_ROUTE', message: 'route invalid' }
      }
    }
  }, (request, reply) => {
    reply.send(request.body)
  })

  const response = await fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'whatever'
    },
    payload: createPayload(zlib.createDeflate)
  })

  t.assert.equal(response.statusCode, 415)
  t.assert.ok(globalCalled, 'global onUnsupportedRequestEncoding should be called when route does not override it')
})

test('global onInvalidRequestPayload should be used when route only overrides onUnsupportedRequestEncoding', async (t) => {
  let globalCalled = false

  const fastify = Fastify()
  await fastify.register(fastifyCompress, {
    global: true,
    onInvalidRequestPayload: () => {
      globalCalled = true
      return { statusCode: 400, code: 'CUSTOM_GLOBAL', message: 'global invalid' }
    }
  })

  fastify.post('/', {
    decompress: {
      onUnsupportedRequestEncoding: () => {
        return { statusCode: 415, code: 'CUSTOM_ROUTE', message: 'route unsupported' }
      }
    }
  }, (request, reply) => {
    reply.send(request.body)
  })

  const response = await fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'deflate'
    },
    payload: createPayload(zlib.createGzip)
  })

  t.assert.equal(response.statusCode, 400)
  t.assert.ok(globalCalled, 'global onInvalidRequestPayload should be called when route does not override it')
})

test('route onUnsupportedRequestEncoding should override global one', async (t) => {
  let globalCalled = false
  let routeCalled = false

  const fastify = Fastify()
  await fastify.register(fastifyCompress, {
    global: true,
    onUnsupportedRequestEncoding: () => {
      globalCalled = true
      return { statusCode: 415, code: 'CUSTOM_GLOBAL', message: 'global unsupported' }
    }
  })

  fastify.post('/', {
    decompress: {
      onUnsupportedRequestEncoding: () => {
        routeCalled = true
        return { statusCode: 415, code: 'CUSTOM_ROUTE', message: 'route unsupported' }
      }
    }
  }, (request, reply) => {
    reply.send(request.body)
  })

  const response = await fastify.inject({
    url: '/',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-encoding': 'whatever'
    },
    payload: createPayload(zlib.createDeflate)
  })

  t.assert.equal(response.statusCode, 415)
  t.assert.ok(routeCalled, 'route onUnsupportedRequestEncoding should be called')
  t.assert.equal(globalCalled, false, 'global onUnsupportedRequestEncoding should NOT be called')
})

test('global onInvalidRequestPayload should be inherited when route only sets removeContentLengthHeader (compress)', async (t) => {
  let globalCalled = false

  const fastify = Fastify()
  await fastify.register(fastifyCompress, {
    global: true,
    onUnsupportedEncoding: () => {
      globalCalled = true
      return { statusCode: 400, code: 'CUSTOM_GLOBAL', message: 'global unsupported encoding' }
    }
  })

  fastify.get('/', {
    compress: {
      removeContentLengthHeader: false
    }
  }, async () => ({ ok: true }))

  const response = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'accept-encoding': 'unsupported-encoding-value'
    }
  })

  t.assert.ok(globalCalled, 'global onUnsupportedEncoding should be called when route only overrides removeContentLengthHeader')
})
