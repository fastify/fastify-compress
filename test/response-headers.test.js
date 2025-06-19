'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const Fastify = require('fastify')
const fastifyCompress = require('..')

test('It should copy headers from Response objects', async () => {
  const fastify = Fastify()
  await fastify.register(fastifyCompress, { threshold: 0 })

  fastify.get('/', async (request, reply) => {
    const response = new Response('Hello World', {
      status: 201,
      headers: {
        'content-type': 'text/plain',
        'x-custom-header': 'test-value',
        'cache-control': 'no-cache'
      }
    })
    return response
  })

  const response = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'accept-encoding': 'gzip'
    }
  })

  assert.equal(response.statusCode, 201)
  assert.equal(response.headers['content-type'], 'text/plain')
  assert.equal(response.headers['x-custom-header'], 'test-value')
  assert.equal(response.headers['cache-control'], 'no-cache')
  assert.equal(response.headers['content-encoding'], 'gzip')
})

test('It should not override headers already set on reply', async () => {
  const fastify = Fastify()
  await fastify.register(fastifyCompress, { threshold: 0 })

  fastify.get('/', async (request, reply) => {
    // Set headers on reply first
    reply.header('content-type', 'text/html')
    reply.header('x-custom-header', 'reply-value')
    reply.code(202)
    
    // Return Response with different headers
    const response = new Response('Hello World', {
      status: 201,
      headers: {
        'content-type': 'text/plain',
        'x-custom-header': 'response-value',
        'x-another-header': 'test'
      }
    })
    return response
  })

  const response = await fastify.inject({
    method: 'GET',
    url: '/',
    headers: {
      'accept-encoding': 'gzip'
    }
  })

  // Reply headers should take precedence
  assert.equal(response.statusCode, 202)
  assert.equal(response.headers['content-type'], 'text/html')
  assert.equal(response.headers['x-custom-header'], 'reply-value')
  // But Response headers not already set should be added
  assert.equal(response.headers['x-another-header'], 'test')
  assert.equal(response.headers['content-encoding'], 'gzip')
})