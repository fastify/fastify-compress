'use strict'

const { test } = require('node:test')
const zlib = require('node:zlib')
const Fastify = require('fastify')
const fastifyCompress = require('../..')

const largeJsonString = JSON.stringify({
  text: 'Lorem ipsum dolor sit amet. '.repeat(2048),
})

async function routes (fastify) {
  fastify.route({
    method: 'GET',
    url: '/api/compress-test',
    handler: async function (_request, reply) {
      reply.type('application/json')
      return reply.compress(largeJsonString)
    }
  })
}

test('should compress large payload without premature close', async (t) => {
  const fastify = Fastify()
  await fastify.register(fastifyCompress, { encodings: ['gzip'], global: true })
  await fastify.register(routes)

  const response = await fastify.inject({
    url: '/api/compress-test',
    method: 'GET',
    headers: { 'accept-encoding': 'gzip' }
  })

  t.assert.equal(response.statusCode, 200)
  t.assert.equal(response.headers['content-encoding'], 'gzip')
  t.assert.ok(
    response.rawPayload.length > 0,
    `Expected compressed response body, got ${response.rawPayload.length} bytes`
  )

  const decompressed = zlib.gunzipSync(response.rawPayload)
  t.assert.equal(decompressed.toString('utf-8'), largeJsonString)
})
