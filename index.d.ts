import { Plugin } from 'fastify'
import { Server, IncomingMessage, ServerResponse } from 'http'

type EncodingToken = 'br' | 'deflate' | 'gzip' | 'identity'

declare const fastifyCompress: Plugin<
  Server,
  IncomingMessage,
  ServerResponse,
  {
    global?: boolean
    threshold?: number
    customTypes?: RegExp
    brotli?: NodeModule
    zlib?: NodeModule
    inflateIfDeflated?: boolean
    encodings?: Array<EncodingToken>
  }
>

export = fastifyCompress
