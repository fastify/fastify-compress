'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const compressPlugin = require('../index')

test('it should not throw when the Content-Type header is an array', async (t) => {
  t.plan(1)

  const fastify = Fastify()
  await fastify.register(compressPlugin, { threshold: 0 })

  fastify.get('/', (_request, reply) => {
    reply.header('Content-Type', ['application/force-download'])
    reply.send('hello world')
  })

  const response = await fastify.inject({
    url: '/',
    method: 'GET',
    headers: {
      'accept-encoding': 'gzip'
    }
  })

  t.assert.equal(response.statusCode, 200)
})