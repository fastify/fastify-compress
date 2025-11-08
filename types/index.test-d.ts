import fastify, { FastifyInstance } from 'fastify'
import { createReadStream } from 'node:fs'
import { expectError, expectType } from 'tsd'
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
  expectType<void>(reply.compress(stream))
})

app.get('/test-two', async (_request, reply) => {
  expectError(reply.compress())
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
  expectType<void>(reply.type('text/plain').compress(stream))
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
  expectType<void>(reply.type('text/plain').compress(stream))
})

expectError(
  appWithoutGlobal.get('/throw-a-ts-arg-error-on-shorthand-route', {
    compress: 'bad compress route option value',
    decompress: 'bad decompress route option value'
  }, (_request, reply) => {
    expectType<void>(reply.type('text/plain').compress(stream))
  })
)

expectError(
  appWithoutGlobal.route({
    method: 'GET',
    path: '/throw-a-ts-arg-error',
    compress: 'bad compress route option value',
    decompress: 'bad decompress route option value',
    handler: (_request, reply) => { expectType<void>(reply.type('text/plain').compress(stream)) }
  })
)

appWithoutGlobal.inject(
  {
    method: 'GET',
    path: '/throw-a-ts-arg-error',
    headers: {
      'accept-encoding': 'gzip'
    }
  },
  (err) => {
    expectType<Error | undefined>(err)
  }
)

// Test that invalid encoding values trigger TypeScript errors
expectError(fastify().register(fastifyCompress, {
  encodings: ['invalid-encoding']
}))

expectError(fastify().register(fastifyCompress, {
  requestEncodings: ['another-invalid-encoding']
}))

// Instantiation of an app that should trigger a typescript error
const appThatTriggerAnError = fastify()
expectError(appThatTriggerAnError.register(fastifyCompress, {
  global: true,
  thisOptionDoesNotExist: 'trigger a typescript error'
}))

app.get('/ts-fetch-response', async (_request, reply) => {
  const resp = new Response('ok', { headers: { 'content-type': 'text/plain' } })
  expectType<void>(reply.compress(resp))
})

app.get('/ts-web-readable-stream', async (_request, reply) => {
  const stream = new ReadableStream({
    start (controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.close()
    }
  })
  expectType<void>(reply.compress(stream))
})
