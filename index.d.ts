import { FastifyPlugin, FastifyReply, FastifyRequest } from 'fastify';
import { Input, InputObject } from 'into-stream';
import { Stream } from 'stream';
import { BrotliOptions, ZlibOptions } from 'zlib';

declare module "fastify" {
  interface FastifyReply {
    compress(input: Stream | Input | InputObject): void;
  }
}

type EncodingToken = 'br' | 'deflate' | 'gzip' | 'identity'

export interface FastifyCompressOptions {
  global?: boolean
  threshold?: number
  customTypes?: RegExp
  zlib?: NodeModule
  brotliOptions?: BrotliOptions
  zlibOptions?: ZlibOptions
  inflateIfDeflated?: boolean
  onUnsupportedEncoding?: (encoding: string, request: FastifyRequest, reply: FastifyReply) => string | Buffer | Stream
  encodings?: Array<EncodingToken>
  requestEncodings?: Array<EncodingToken> 
  forceRequestEncoding?: EncodingToken
  onUnsupportedRequestEncoding?: (encoding: string, request: FastifyRequest, reply: FastifyReply) => Error | undefined | null
  onInvalidRequestPayload?: (encoding: string, request: FastifyRequest, error: Error) => Error | undefined | null
}

declare const fastifyCompress: FastifyPlugin<FastifyCompressOptions>
export default fastifyCompress;
