import {
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
  RawServerBase,
  RawServerDefault,
  RouteOptions as FastifyRouteOptions
} from 'fastify'
import { Input, InputObject } from 'into-stream'
import { Stream } from 'stream'
import { BrotliOptions, ZlibOptions } from 'zlib'

declare module 'fastify' {
  export interface FastifyContextConfig {
    /** @deprecated `config.compress` is deprecated, use `compress` shorthand option instead */
    compress?: RouteCompressOptions | false;
    /** @deprecated `config.decompress` is deprecated, use `decompress` shorthand option instead */
    decompress?: RouteDecompressOptions | false;
  }

  export interface RouteShorthandOptions<
    RawServer extends RawServerBase = RawServerDefault
  > {
    compress?: RouteCompressOptions | false;
    decompress?: RouteDecompressOptions | false;
  }

  interface FastifyReply {
    compress(input: Stream | Input | InputObject): void;
  }

  export interface RouteOptions {
    compress?: RouteCompressOptions | false;
    decompress?: RouteDecompressOptions | false;
  }
}

type FastifyCompress = FastifyPluginCallback<fastifyCompress.FastifyCompressOptions>

type RouteCompressOptions = Pick<fastifyCompress.FastifyCompressOptions,
  | 'brotliOptions'
  | 'customTypes'
  | 'encodings'
  | 'inflateIfDeflated'
  | 'onUnsupportedEncoding'
  | 'removeContentLengthHeader'
  | 'threshold'
  | 'zlib'
  | 'zlibOptions'
>

type RouteDecompressOptions = Pick<fastifyCompress.FastifyCompressOptions,
  | 'forceRequestEncoding'
  | 'onInvalidRequestPayload'
  | 'onUnsupportedRequestEncoding'
  | 'requestEncodings'
  | 'zlib'
>

type EncodingToken = 'br' | 'deflate' | 'gzip' | 'identity';

type CompressibleContentTypeFunction = (contentType: string) => boolean;

declare namespace fastifyCompress {

  export interface FastifyCompressOptions {
    brotliOptions?: BrotliOptions;
    customTypes?: RegExp | CompressibleContentTypeFunction;
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

  export interface FastifyCompressRouteOptions {
    compress?: RouteCompressOptions | false;
    decompress?: RouteDecompressOptions | false;
  }

  export interface RouteOptions extends FastifyRouteOptions, FastifyCompressRouteOptions { }

  export interface RoutesConfigCompressOptions {
    /** @deprecated `config.compress` is deprecated, use `compress` shorthand option instead */
    compress?: RouteCompressOptions | false;
    /** @deprecated `config.decompress` is deprecated, use `decompress` shorthand option instead */
    decompress?: RouteDecompressOptions | false;
  }

  export const fastifyCompress: FastifyCompress
  export { fastifyCompress as default }
}

declare function fastifyCompress(...params: Parameters<FastifyCompress>): ReturnType<FastifyCompress>
export = fastifyCompress
