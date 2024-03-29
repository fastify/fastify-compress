'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const fastifyCompress = require('..')
const fsPromises = require("fs").promises
const { join } = require('path')
const { fetch } = require('undici')

test('should not corrupt the file content', async (t) => {
  const fastify = new Fastify()
  t.teardown(() => fastify.close())

  fastify.register(async (instance, opts) => {
    await fastify.register(fastifyCompress)
    instance.get('/issue', async (req, reply) => {
      const longStringWithEmoji = await fsPromises.readFile(join(__dirname, "./test.txt"), "utf-8");

      return longStringWithEmoji  // <--- the file content is corrupt
      // search for "hydra.alibaba.com" will see 2 wired question marks instead of emoji
    })
  })

  fastify.get('/good', async (req, reply) => {
    const longStringWithEmoji = await fsPromises.readFile(join(__dirname, "./test.txt"), "utf-8");

    return longStringWithEmoji  // <--- the file content is ok
    // search for "hydra.alibaba.com" will see emoji
  })

  await fastify.listen({ port: 0 })

  const { port } = fastify.server.address()
  const url = `http://localhost:${port}`
  const response = await fetch(`${url}/issue`)
  const response2 = await fetch(`${url}/good`)
  const body = await response.text()
  const body2 = await response2.text()
  t.equal(body, body2)
})
