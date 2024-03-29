'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const fastifyCompress = require('..')
const { request, setGlobalDispatcher, Agent } = require('undici')

setGlobalDispatcher(new Agent({
  keepAliveTimeout: 10,
  keepAliveMaxTimeout: 10
}))

test('should not corrupt the file content', async (t) => {
  // provide 2 byte unicode content
  const twoByteUnicodeContent = new Array(5_000)
    .fill('0')
    .map(() => {
      const random = new Array(10).fill('A').join('🍃')
      return random + '- FASTIFY COMPRESS,🍃 FASTIFY COMPRESS'
    })
    .join('\n')
  const fastify = new Fastify()
  t.teardown(() => fastify.close())

  fastify.register(async (instance, opts) => {
    await fastify.register(fastifyCompress)
    // compression
    instance.get('/issue', async (req, reply) => {
      return twoByteUnicodeContent
    })
  })

  // no compression
  fastify.get('/good', async (req, reply) => {
    return twoByteUnicodeContent
  })

  await fastify.listen({ port: 0 })

  const { port } = fastify.server.address()
  const url = `http://localhost:${port}`

  const response = await request(`${url}/issue`)
  const response2 = await request(`${url}/good`)
  const body = await response.body.text()
  const body2 = await response2.body.text()
  t.equal(body, body2)
})
