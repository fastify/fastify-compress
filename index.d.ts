import * as fastify from 'fastify'
import { FastifyPluginCallback, FastifyReply, FastifyRequest, RawServerBase, RawServerDefault } from 'fastify'
import { Input, InputObject } from 'into-stream'
import { Stream } from 'stream'
import { BrotliOptions, ZlibOptions } from 'zlib'

type EncodingToken = 'br' | 'deflate' | 'gzip' | 'identity';

export interface FastifyCompressOptions {
  brotliOptions?: BrotliOptions;
  customTypes?: RegExp;
  encodings?: EncodingToken[];
  forceRequestEncoding?: EncodingToken;
  global?: boolean;
  inflateIfDeflated?: boolean;
  onInvalidRequestPayload?: (encoding: string, request: FastifyRequest, error: Error) => Error | undefined | null;
  onUnsupportedEncoding?: (encoding: string, request: FastifyRequest, reply: FastifyReply) => string | Buffer | Stream;
  onUnsupportedRequestEncoding?: (encoding: string, request: FastifyRequest, reply: FastifyReply) => Error | undefined | null;
  requestEncodings?: EncodingToken[];
  threshold?: number;
  zlib?: unknown;
  zlibOptions?: ZlibOptions;
}

interface RouteCompressOptions extends Pick<FastifyCompressOptions,
  | 'brotliOptions'
  | 'customTypes'
  | 'encodings'
  | 'inflateIfDeflated'
  | 'onUnsupportedEncoding'
  | 'threshold'
  | 'zlib'
  | 'zlibOptions'
> {}

interface RouteDecompressOptions extends Pick<FastifyCompressOptions,
  | 'forceRequestEncoding'
  | 'onInvalidRequestPayload'
  | 'onUnsupportedRequestEncoding'
  | 'requestEncodings'
  | 'zlib'
> {}

interface FastifyCompressRouteOptions {
  compress?: false | RouteCompressOptions;
  decompress?: false | RouteDecompressOptions;
}

export interface RouteOptions extends fastify.RouteOptions, FastifyCompressRouteOptions {}

declare module 'fastify' {
  export interface RouteShorthandOptions<
    RawServer extends RawServerBase = RawServerDefault
  > extends FastifyCompressRouteOptions { }

  interface FastifyReply {
    compress(input: Stream | Input | InputObject): void;
  }

  export interface RouteOptions extends FastifyCompressRouteOptions {}
}

declare const fastifyCompress: FastifyPluginCallback<FastifyCompressOptions>
export default fastifyCompress
