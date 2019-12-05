import { Plugin, FastifyReply, FastifyRequest } from 'fastify'
import { Server, IncomingMessage, ServerResponse } from 'http'
import { Stream } from 'stream';

type EncodingToken = 'br' | 'deflate' | 'gzip' | 'identity'

declare namespace fastifyCompress {
  interface FastifyCompressOptions {
    global?: boolean
    threshold?: number
    customTypes?: RegExp
    brotli?: NodeModule
    zlib?: NodeModule
    inflateIfDeflated?: boolean
    onUnsupportedEncoding?: (encoding: string, request: FastifyRequest<ServerResponse>, reply: FastifyReply<ServerResponse>) => string | Buffer | Stream
    encodings?: Array<EncodingToken>
  }
}

declare const fastifyCompress: Plugin<
  Server,
  IncomingMessage,
  ServerResponse,
  fastifyCompress.FastifyCompressOptions
>

export = fastifyCompress
