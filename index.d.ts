import { Plugin } from 'fastify'
import { Server, IncomingMessage, ServerResponse } from 'http'

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
  }
>

export = fastifyCompress
