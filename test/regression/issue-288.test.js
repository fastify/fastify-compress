'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const fastifyCompress = require('../..')
const { request } = require('node:http')

function fetch (url) {
  return new Promise(function (resolve, reject) {
    request(url, function (response) {
      // we need to use Buffer.concat to prevent wrong utf8 handling
      let body = Buffer.from('')
      response.on('data', function (chunk) {
        body = Buffer.concat([body, Buffer.from(chunk, 'utf-8')])
      })
      response.once('error', reject)
      response.once('end', function () {
        resolve(body.toString())
      })
    })
      .once('error', reject)
      .end()
  })
}

test('should not corrupt the file content', async (t) => {
  t.plan(2)

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

  const [body1, body2] = await Promise.all([
    fetch(`${address}/compress`),
    fetch(`${address}/no-compress`)
  ])

  t.equal(body1, body2)
  t.equal(body1, twoByteUnicodeContent)
})
