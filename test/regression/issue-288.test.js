'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const fastifyCompress = require('../..')
const fetch = require('node-fetch')

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
    instance.get('/compress', async (req, reply) => {
      return twoByteUnicodeContent
    })
  })

  // no compression
  fastify.get('/no-compress', async (req, reply) => {
    return twoByteUnicodeContent
  })

  const address = await fastify.listen({ port: 0, host: '127.0.0.1' })

  const response1 = await fetch(`${address}/compress`)
  const response2 = await fetch(`${address}/no-compress`)
  const body1 = await response1.text()
  const body2 = await response2.text()
  t.equal(body1, body2)
  t.equal(body1, twoByteUnicodeContent)
})
