import fastify, { FastifyInstance } from 'fastify'
import { createReadStream } from 'node:fs'
import { expect } from 'tstyche'
import * as zlib from 'node:zlib'
import fastifyCompress, { FastifyCompressOptions } from '..'

const stream = createReadStream('./package.json')

const withGlobalOptions: FastifyCompressOptions = {
  global: true,
  threshold: 10,
  zlib,
  brotliOptions: {
    params: {
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
      [zlib.constants.BROTLI_PARAM_QUALITY]: 4
    }
  },
  zlibOptions: { level: 1 },
  inflateIfDeflated: true,
  customTypes: /x-protobuf$/,
  encodings: ['gzip', 'br', 'identity', 'deflate'],
  requestEncodings: ['gzip', 'br', 'identity', 'deflate'],
  forceRequestEncoding: 'gzip',
  removeContentLengthHeader: true
}

const withZstdOptions: FastifyCompressOptions = {
  encodings: ['zstd', 'br', 'gzip', 'deflate', 'identity'],
  requestEncodings: ['zstd', 'br', 'gzip', 'deflate', 'identity']
}

const app: FastifyInstance = fastify()
app.register(fastifyCompress, withGlobalOptions)
app.register(fastifyCompress, withZstdOptions)

app.register(fastifyCompress, {
  customTypes: value => value === 'application/json'
})

app.get('/test-one', async (_request, reply) => {
  expect(reply.compress(stream)).type.toBe<void>()
})

app.get('/test-two', async (_request, reply) => {
  expect(reply.compress).type.not.toBeCallableWith()
})

// Instantiation of an app without global
const appWithoutGlobal: FastifyInstance = fastify()
appWithoutGlobal.register(fastifyCompress, { global: false })

appWithoutGlobal.get('/one', {
  compress: {
    zlib: {
      createGzip: () => zlib.createGzip()
    },
    removeContentLengthHeader: false
  },
  decompress: {
    forceRequestEncoding: 'gzip',
    zlib: {
      createGunzip: () => zlib.createGunzip()
    }
  }
}, (_request, reply) => {
  expect(reply.type('text/plain').compress(stream)).type.toBe<void>()
})

appWithoutGlobal.get('/two', {
  config: {
    compress: {
      zlib: {
        createGzip: () => zlib.createGzip()
      }
    },
    decompress: {
      forceRequestEncoding: 'gzip',
      zlib: {
        createGunzip: () => zlib.createGunzip()
      }
    }
  }
}, (_request, reply) => {
  expect(reply.type('text/plain').compress(stream)).type.toBe<void>()
})

appWithoutGlobal.get('/throw-a-ts-arg-error-on-shorthand-route', {
  // @ts-expect-error Type 'string' is not assignable
  compress: 'bad compress route option value',
  // @ts-expect-error Type 'string' is not assignable
  decompress: 'bad decompress route option value'
}, (_request, reply) => {
  reply.type('text/plain').compress(stream)
})

appWithoutGlobal.route({
  method: 'GET',
  path: '/throw-a-ts-arg-error',
  // @ts-expect-error Type 'string' is not assignable
  compress: 'bad compress route option value',
  // @ts-expect-error Type 'string' is not assignable
  decompress: 'bad decompress route option value',
  handler: (_request, reply) => { reply.type('text/plain').compress(stream) }
})

appWithoutGlobal.inject(
  {
    method: 'GET',
    path: '/throw-a-ts-arg-error',
    headers: {
      'accept-encoding': 'gzip'
    }
  },
  (err) => {
    expect(err).type.toBe<Error | undefined>()
  }
)

// Test that invalid encoding values trigger TypeScript errors
expect(fastify().register).type.not.toBeCallableWith(fastifyCompress, {
  encodings: ['invalid-encoding']
})

expect(fastify().register).type.not.toBeCallableWith(fastifyCompress, {
  requestEncodings: ['another-invalid-encoding']
})

// Instantiation of an app that should trigger a typescript error
const appThatTriggerAnError = fastify()
expect(appThatTriggerAnError.register).type.not.toBeCallableWith(fastifyCompress, {
  global: true,
  thisOptionDoesNotExist: 'trigger a typescript error'
})

app.get('/ts-fetch-response', async (_request, reply) => {
  const resp = new Response('ok', { headers: { 'content-type': 'text/plain' } })
  expect(reply.compress(resp)).type.toBe<void>()
})

app.get('/ts-web-readable-stream', async (_request, reply) => {
  const stream = new ReadableStream({
    start (controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.close()
    }
  })
  expect(reply.compress(stream)).type.toBe<void>()
})
