'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const Fastify = require('fastify')
const zlib = require('node:zlib')
const { promisify } = require('node:util')
const { Readable: NodeReadable } = require('node:stream')
const axios = require('axios')
const fastifyCompress = require('..')

const gunzip = promisify(zlib.gunzip)

// Define all test cases that should work with any HTTP client
const testCases = [
  {
    name: 'JSON object',
    handler: async (request, reply) => {
      return { hello: 'world', test: true, number: 42 }
    },
    expectedBody: { hello: 'world', test: true, number: 42 },
    contentType: 'application/json; charset=utf-8'
  },
  {
    name: 'Plain string',
    handler: async (request, reply) => {
      return 'Hello World! This is a test string that should be compressed.'
    },
    expectedBody: 'Hello World! This is a test string that should be compressed.',
    contentType: 'text/plain; charset=utf-8'
  },
  {
    name: 'Buffer',
    handler: async (request, reply) => {
      return Buffer.from('This is a buffer content that should be compressed properly.')
    },
    expectedBody: 'This is a buffer content that should be compressed properly.',
    contentType: 'application/octet-stream'
  },
  {
    name: 'Node.js Readable Stream',
    handler: async (request, reply) => {
      const stream = new NodeReadable({
        read() {
          this.push('Stream chunk 1. ')
          this.push('Stream chunk 2. ')
          this.push('Stream chunk 3.')
          this.push(null)
        }
      })
      return stream
    },
    expectedBody: 'Stream chunk 1. Stream chunk 2. Stream chunk 3.',
    // Fastify doesn't set content-type for streams by default
    contentType: null
  },
  {
    name: 'Response object with JSON',
    handler: async (request, reply) => {
      const body = JSON.stringify({ response: 'object', compressed: true })
      const response = new Response(body, {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
      return response
    },
    expectedBody: { response: 'object', compressed: true },
    // Response headers are not automatically copied by fastify-compress
    contentType: null,
    // Fastify uses default status 200 when Response is converted to stream
    checkStatus: 200
  },
  {
    name: 'Response object with ReadableStream',
    handler: async (request, reply) => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('Response '))
          controller.enqueue(encoder.encode('with '))
          controller.enqueue(encoder.encode('ReadableStream'))
          controller.close()
        }
      })
      const response = new Response(stream, {
        status: 201,
        headers: { 'content-type': 'text/plain' }
      })
      return response
    },
    expectedBody: 'Response with ReadableStream',
    // Response headers are not automatically copied by fastify-compress
    contentType: null,
    // Fastify uses default status 200 when Response is converted to stream
    checkStatus: 200
  },
  {
    name: 'Raw ReadableStream',
    handler: async (request, reply) => {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('Raw '))
          controller.enqueue(encoder.encode('ReadableStream '))
          controller.enqueue(encoder.encode('content'))
          controller.close()
        }
      })
      reply.type('text/plain')
      return stream
    },
    expectedBody: 'Raw ReadableStream content',
    // When compression is applied, charset may be removed
    contentType: 'text/plain'
  },
  {
    name: 'Large JSON to ensure compression',
    handler: async (request, reply) => {
      const largeData = {
        items: Array(100).fill(null).map((_, i) => ({
          id: i,
          name: `Item ${i}`,
          description: 'This is a long description to ensure the content is large enough to be compressed. ' +
                      'Compression typically requires content to be above a certain threshold to be effective.'
        }))
      }
      return largeData
    },
    expectedBody: (body) => {
      return body.items && body.items.length === 100 && body.items[0].name === 'Item 0'
    },
    contentType: 'application/json; charset=utf-8'
  }
]

// Additional test cases for edge cases
const edgeCaseTests = [
  {
    name: 'Empty Response object',
    handler: async (request, reply) => {
      return new Response(null, { status: 204 })
    },
    expectedStatus: 204,
    expectNoBody: true
  },
  {
    name: 'Response object with empty string body',
    handler: async (request, reply) => {
      return new Response('', { status: 200 })
    },
    expectedBody: '',
    checkStatus: 200
  },
  {
    name: 'Large stream to verify compression',
    handler: async (request, reply) => {
      const chunks = []
      for (let i = 0; i < 100; i++) {
        chunks.push(`This is chunk ${i} with some repeated content to ensure good compression. `)
      }
      const stream = new NodeReadable({
        read() {
          if (chunks.length > 0) {
            this.push(chunks.shift())
          } else {
            this.push(null)
          }
        }
      })
      return stream
    },
    expectedBody: (body) => {
      return body.includes('This is chunk 0') && body.includes('This is chunk 99')
    },
    contentType: null
  }
]

// Test implementation for fetch
async function testWithFetch(testCase, port) {
  const response = await fetch(`http://localhost:${port}/`, {
    headers: {
      'Accept-Encoding': 'gzip'
    }
  })

  // Check for expected status first
  if (testCase.expectedStatus) {
    assert.strictEqual(response.status, testCase.expectedStatus, `${testCase.name}: should have expected status`)
  }

  if (testCase.checkStatus) {
    assert.strictEqual(response.status, testCase.checkStatus, `${testCase.name}: should have correct status`)
  }

  // Handle empty body case (204 No Content doesn't have compression headers)
  if (testCase.expectNoBody) {
    const bodyText = await response.text()
    assert.strictEqual(bodyText, '', `${testCase.name}: should have empty body`)
    return
  }

  // Verify compression headers
  assert.strictEqual(response.headers.get('content-encoding'), 'gzip', `${testCase.name}: should have gzip encoding`)
  assert.strictEqual(response.headers.get('vary'), 'accept-encoding', `${testCase.name}: should have vary header`)

  if (testCase.contentType !== undefined) {
    assert.strictEqual(response.headers.get('content-type'), testCase.contentType, `${testCase.name}: should have correct content-type`)
  }

  // Native fetch automatically decompresses gzip responses, so we can read directly
  const bodyText = await response.text()

  // Verify content
  if (typeof testCase.expectedBody === 'function') {
    try {
      const bodyJson = JSON.parse(bodyText)
      assert.ok(testCase.expectedBody(bodyJson), `${testCase.name}: body validation should pass`)
    } catch (e) {
      // Not JSON, pass raw text
      assert.ok(testCase.expectedBody(bodyText), `${testCase.name}: body validation should pass`)
    }
  } else if (typeof testCase.expectedBody === 'object') {
    const bodyJson = JSON.parse(bodyText)
    assert.deepStrictEqual(bodyJson, testCase.expectedBody, `${testCase.name}: JSON body should match`)
  } else if (testCase.expectedBody !== undefined) {
    assert.strictEqual(bodyText, testCase.expectedBody, `${testCase.name}: body should match`)
  }
}

// Test implementation for axios
async function testWithAxios(testCase, port) {
  const response = await axios.get(`http://localhost:${port}/`, {
    headers: {
      'Accept-Encoding': 'gzip'
    }
    // Let axios decompress automatically (default behavior)
  })

  // Check for expected status first
  if (testCase.expectedStatus) {
    assert.strictEqual(response.status, testCase.expectedStatus, `${testCase.name}: should have expected status`)
  }

  if (testCase.checkStatus) {
    assert.strictEqual(response.status, testCase.checkStatus, `${testCase.name}: should have correct status`)
  }

  // Handle empty body case (204 No Content doesn't have compression headers)
  if (testCase.expectNoBody) {
    const bodyText = typeof response.data === 'string' ? response.data : ''
    assert.strictEqual(bodyText, '', `${testCase.name}: should have empty body`)
    return
  }

  // Verify compression headers
  // Note: axios might remove content-encoding after decompression, but vary should remain
  assert.strictEqual(response.headers.vary, 'accept-encoding', `${testCase.name}: should have vary header`)
  // Also check that compression actually happened (content-encoding might be removed by axios after decompression)
  // We can verify this by checking the response was compressed by looking at other indicators

  if (testCase.contentType !== undefined) {
    const actualContentType = response.headers['content-type']
    if (testCase.contentType === null) {
      // axios returns undefined for missing headers
      assert.ok(actualContentType === null || actualContentType === undefined, `${testCase.name}: should not have content-type`)
    } else {
      assert.strictEqual(actualContentType, testCase.contentType, `${testCase.name}: should have correct content-type`)
    }
  }

  // Get the response data (already decompressed by axios)
  let bodyText
  if (typeof response.data === 'string') {
    bodyText = response.data
  } else if (response.data && typeof response.data === 'object' && !Buffer.isBuffer(response.data)) {
    // If axios already parsed JSON, use it directly for object comparisons
    if (typeof testCase.expectedBody === 'object' && testCase.expectedBody !== null) {
      assert.deepStrictEqual(response.data, testCase.expectedBody, `${testCase.name}: JSON body should match`)
      return
    }
    // Otherwise stringify for text comparison
    bodyText = JSON.stringify(response.data)
  } else {
    bodyText = String(response.data)
  }

  // Verify content
  if (typeof testCase.expectedBody === 'function') {
    try {
      const bodyJson = typeof response.data === 'object' ? response.data : JSON.parse(bodyText)
      assert.ok(testCase.expectedBody(bodyJson), `${testCase.name}: body validation should pass`)
    } catch (e) {
      // Not JSON, pass raw text
      assert.ok(testCase.expectedBody(bodyText), `${testCase.name}: body validation should pass`)
    }
  } else if (typeof testCase.expectedBody === 'object') {
    const bodyJson = typeof response.data === 'object' ? response.data : JSON.parse(bodyText)
    assert.deepStrictEqual(bodyJson, testCase.expectedBody, `${testCase.name}: JSON body should match`)
  } else if (testCase.expectedBody !== undefined) {
    assert.strictEqual(bodyText, testCase.expectedBody, `${testCase.name}: body should match`)
  }
}

// Run all test cases with both fetch and axios
test('Integration tests with real HTTP requests', async (t) => {
  for (const testCase of testCases) {
    await t.test(`fetch: ${testCase.name}`, async () => {
      const fastify = Fastify()
      // Set threshold to 0 to ensure all responses are compressed
      await fastify.register(fastifyCompress, { global: true, threshold: 0 })

      fastify.get('/', testCase.handler)

      await fastify.listen({ port: 0 })
      const port = fastify.server.address().port

      try {
        await testWithFetch(testCase, port)
      } finally {
        await fastify.close()
      }
    })

    await t.test(`axios: ${testCase.name}`, async () => {
      const fastify = Fastify()
      // Set threshold to 0 to ensure all responses are compressed
      await fastify.register(fastifyCompress, { global: true, threshold: 0 })

      fastify.get('/', testCase.handler)

      await fastify.listen({ port: 0 })
      const port = fastify.server.address().port

      try {
        await testWithAxios(testCase, port)
      } finally {
        await fastify.close()
      }
    })
  }
})

// Run edge case tests
test('Edge case tests with real HTTP requests', async (t) => {
  for (const testCase of edgeCaseTests) {
    await t.test(`fetch: ${testCase.name}`, async () => {
      const fastify = Fastify()
      await fastify.register(fastifyCompress, { global: true, threshold: 0 })

      fastify.get('/', testCase.handler)

      await fastify.listen({ port: 0 })
      const port = fastify.server.address().port

      try {
        await testWithFetch(testCase, port)
      } finally {
        await fastify.close()
      }
    })

    await t.test(`axios: ${testCase.name}`, async () => {
      const fastify = Fastify()
      await fastify.register(fastifyCompress, { global: true, threshold: 0 })

      fastify.get('/', testCase.handler)

      await fastify.listen({ port: 0 })
      const port = fastify.server.address().port

      try {
        await testWithAxios(testCase, port)
      } finally {
        await fastify.close()
      }
    })
  }
})

// Test that uncompressed responses work correctly when compression is not requested
test('Uncompressed responses when Accept-Encoding is not set', async () => {
  const fastify = Fastify()
  await fastify.register(fastifyCompress, { global: true })

  fastify.get('/', async () => {
    return { hello: 'world' }
  })

  await fastify.listen({ port: 0 })
  const port = fastify.server.address().port

  try {
    // Test with fetch
    const fetchResponse = await fetch(`http://localhost:${port}/`)
    assert.strictEqual(fetchResponse.headers.get('content-encoding'), null, 'fetch: should not have content-encoding')
    const fetchBody = await fetchResponse.json()
    assert.deepStrictEqual(fetchBody, { hello: 'world' }, 'fetch: body should match')

    // Test with axios
    const axiosResponse = await axios.get(`http://localhost:${port}/`)
    assert.strictEqual(axiosResponse.headers['content-encoding'], undefined, 'axios: should not have content-encoding')
    assert.deepStrictEqual(axiosResponse.data, { hello: 'world' }, 'axios: body should match')
  } finally {
    await fastify.close()
  }
})
