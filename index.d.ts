import { Plugin, FastifyReply } from 'fastify'
import { Server, IncomingMessage, ServerResponse } from 'http'
import { Stream } from 'stream';

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
    onUnsupportedEncoding?: (encoding: string, reply: FastifyReply<ServerResponse>) => string | Buffer | Stream | Error
  }
>

export = fastifyCompress
