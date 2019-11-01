import { Plugin, FastifyReply, FastifyRequest } from 'fastify'
import { Server, IncomingMessage, ServerResponse } from 'http'
import { Stream } from 'stream';

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
    onUnsupportedEncoding?: (encoding: string, reply: FastifyReply<ServerResponse>, request: FastifyRequest<ServerResponse>) => string | Buffer | Stream | Error
    encodings?: Array<EncodingToken>
  }
>

export = fastifyCompress
