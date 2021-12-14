import fastify, { FastifyInstance } from 'fastify'
import { createReadStream } from 'fs'
import { expectError, expectType } from 'tsd'
import * as zlib from 'zlib'
import fastifyCompress, { FastifyCompressOptions } from '../..'

const stream = createReadStream('./package.json')

const withGlobalOptions: FastifyCompressOptions = {
  global: true,
  threshold: 10,
  zlib: zlib,
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

const app: FastifyInstance = fastify()
app.register(fastifyCompress, withGlobalOptions)

app.get('/test-one', async (request, reply) => {
  expectType<void>(reply.compress(stream))
})

app.get('/test-two', async (request, reply) => {
  expectError(reply.compress())
})

// Instanciation of an app without global
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
}, (request, reply) => {
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
}, (request, reply) => {
  expectType<void>(reply.type('text/plain').compress(stream))
})

expectError(
  appWithoutGlobal.get('/throw-a-ts-arg-error-on-shorthand-route', {
    compress: 'bad compress route option value',
    decompress: 'bad decompress route option value'
  }, (request, reply) => {
    expectType<void>(reply.type('text/plain').compress(stream))
  })
)

expectError(
  appWithoutGlobal.route({
    method: 'GET',
    path: '/throw-a-ts-arg-error',
    compress: 'bad compress route option value',
    decompress: 'bad decompress route option value',
    handler: (request, reply) => { expectType<void>(reply.type('text/plain').compress(stream)) }
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
    expectType<Error>(err)
  }
)

// Instanciation of an app that should trigger a typescript error
const appThatTriggerAnError = fastify()
expectError(appThatTriggerAnError.register(fastifyCompress, {
  global: true,
  thisOptionDoesNotExist: 'trigger a typescript error'
}))
