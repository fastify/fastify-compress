import * as fastify from 'fastify'
import * as fastifyCompress from '../..'

const zlib = require('zlib')
const iltorb = require('iltorb')

const app = fastify()

app.register(fastifyCompress, {
  global: true,
  threshold: 10,
  brotli: iltorb,
  zlib: zlib,
  inflateIfDeflated: true,
  customTypes: /x-protobuf$/,
  encodings: ['gzip', 'br', 'identity', 'deflate']
})
