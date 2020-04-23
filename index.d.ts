import { FastifyPlugin, FastifyReply, FastifyRequest, RawServerBase } from 'fastify'
import { Stream } from 'stream';
import { Input, InputObject } from 'into-stream';

declare module "fastify" {
  interface FastifyReplyInterface {
    compress(input: Stream | Input | InputObject): void;
  }
}

type EncodingToken = 'br' | 'deflate' | 'gzip' | 'identity'

export interface FastifyCompressOptions {
  global?: boolean
  threshold?: number
  customTypes?: RegExp
  brotli?: NodeModule
  zlib?: NodeModule
  inflateIfDeflated?: boolean
  onUnsupportedEncoding?: (encoding: string, request: FastifyRequest<RawServerBase>, reply: FastifyReply<RawServerBase>) => string | Buffer | Stream
  encodings?: Array<EncodingToken>
}

declare const fastifyCompress: FastifyPlugin<FastifyCompressOptions>
export default fastifyCompress;
