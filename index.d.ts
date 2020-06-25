import { FastifyPlugin, FastifyReply, FastifyRequest, RawServerBase } from 'fastify';
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
  onUnsupportedEncoding?: (encoding: string, request: FastifyRequest<RawServerBase>, reply: FastifyReply<RawServerBase>) => string | Buffer | Stream
  encodings?: Array<EncodingToken>
  requestEncodings?: Array<EncodingToken> 
  forceRequestEncoding?: EncodingToken
  onUnsupportedRequestEncoding?: (encoding: string, request: FastifyRequest<RawServerBase>, reply: FastifyReply<RawServerBase>) => Error | undefined | null
  onInvalidRequestPayload?: (encoding: string, request: FastifyRequest<RawServerBase>, error: Error) => Error | undefined | null
}

declare const fastifyCompress: FastifyPlugin<FastifyCompressOptions>
export default fastifyCompress;
