import fastify from 'fastify'
import { createReadStream } from 'fs'
import fastifyCompress from '..'

const zlib = require('zlib')

const app = fastify()

app.register(fastifyCompress, {
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
  forceRequestEncoding: 'gzip'
})

const appWithoutGlobal = fastify()

appWithoutGlobal.register(fastifyCompress, { global: false })

appWithoutGlobal.get('/', (req, reply) => {
  reply
    .type('text/plain')
    .compress(createReadStream('./package.json'))
})
