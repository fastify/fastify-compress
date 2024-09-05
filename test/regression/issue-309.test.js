'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const fastifyCompress = require('../..')
const zlib = require('node:zlib')

test('it should handle ReadableStream', async (t) => {
    const expectedData = {
        data: 'to compress'
    }

    const fastify = new Fastify()
    t.after(() => fastify.close())
    fastify.register(async (instance, opts) => {
        await fastify.register(fastifyCompress, {
            threshold: 8
        })
        instance.get('/broken', async (req, reply) => {
            const stream = ReadableStream.from(JSON.stringify(expectedData))
            reply
                .type('application/json')
                .send(stream)
            return reply
        })
      })
    try {
        const response = await fastify.inject({
            method: 'GET',
            url: '/broken',
            headers: {
              'accept-encoding': 'deflate'
            }
        })
        const payload = zlib.inflateSync(response.rawPayload)

        t.assert.deepStrictEqual(JSON.parse(payload.toString('utf-8')), expectedData)
    } catch (e) {
        t.assert.fail(e)
    }
})