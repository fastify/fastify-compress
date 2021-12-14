import {
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
  RawServerBase,
  RawServerDefault
} from 'fastify'
import * as fastify from 'fastify'
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
  removeContentLengthHeader?: boolean;
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
  | 'removeContentLengthHeader'
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
  compress?: RouteCompressOptions | false;
  decompress?: RouteDecompressOptions | false;
}

export interface RouteOptions extends fastify.RouteOptions, FastifyCompressRouteOptions {}

export interface RoutesConfigCompressOptions {
  /** @deprecated `config.compress` is deprecated, use `compress` shorthand option instead */
  compress?: RouteCompressOptions | false;
  /** @deprecated `config.decompress` is deprecated, use `decompress` shorthand option instead */
  decompress?: RouteDecompressOptions | false;
}

declare module 'fastify' {
  export interface FastifyContextConfig extends RoutesConfigCompressOptions {}

  export interface RouteShorthandOptions<
    RawServer extends RawServerBase = RawServerDefault
  > extends FastifyCompressRouteOptions {}

  interface FastifyReply {
    compress(input: Stream | Input | InputObject): void;
  }

  export interface RouteOptions extends FastifyCompressRouteOptions {}
}

declare const fastifyCompress: FastifyPluginCallback<FastifyCompressOptions>
export default fastifyCompress
