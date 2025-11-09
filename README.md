# @fastify/compress

[![CI](https://github.com/fastify/fastify-compress/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/fastify/fastify-compress/actions/workflows/ci.yml)
[![NPM version](https://img.shields.io/npm/v/@fastify/compress.svg?style=flat)](https://www.npmjs.com/package/@fastify/compress)
[![neostandard javascript style](https://img.shields.io/badge/code_style-neostandard-brightgreen?style=flat)](https://github.com/neostandard/neostandard)

Adds compression utils to [the Fastify `reply` object](https://fastify.dev/docs/latest/Reference/Reply/#reply) and a hook to decompress requests payloads.
Supports `gzip`, `deflate`, `brotli`, and `zstd` (Node.js 22.15+/23.8+).

> ℹ️ Note: In large-scale scenarios, use a proxy like Nginx to handle response compression.

> ⚠ Warning: Since `@fastify/compress` version 4.x, payloads compressed with the `zip` algorithm are not automatically uncompressed. This plugin focuses on response compression, and `zip` is not in the [IANA Table of Content Encodings](https://www.iana.org/assignments/http-parameters/http-parameters.xml#content-coding).

## Install
```
npm i @fastify/compress
```

### Compatibility
| Plugin version | Fastify version |
| ---------------|-----------------|
| `>=8.x`        | `^5.x`          |
| `>=6.x <8.x`   | `^4.x`          |
| `>=3.x <6.x`   | `^3.x`          |
| `^2.x`         | `^2.x`          |
| `>=0.x <2.x`   | `^1.x`          |


Please note that if a Fastify version is out of support, then so are the corresponding versions of this plugin
in the table above.
See [Fastify's LTS policy](https://github.com/fastify/fastify/blob/main/docs/Reference/LTS.md) for more details.


## Usage - Compress replies

This plugin adds two functionalities to Fastify: a compress utility and a global compression hook.

Currently, the following encoding tokens are supported, using the first acceptable token in this order:

1. `zstd` (Node.js 22.15+/23.8+)
2. `br`
3. `gzip`
4. `deflate`
5. `*` (no preference — `@fastify/compress` will use `gzip`)
6. `identity` (no compression)

If an unsupported encoding is received or the `'accept-encoding'` header is missing, the payload will not be compressed.
To return an error for unsupported encoding, use the `onUnsupportedEncoding` option.

The plugin compresses payloads based on `content-type`. If absent, it assumes `application/json`.

### Global hook
The global compression hook is enabled by default. To disable it, pass `{ global: false }`:
```js
await fastify.register(
  import('@fastify/compress'),
  { global: false }
)
```

If only compression or decompression is required, set the `globalCompression` or `globalDecompression` config flags to `false` respectively (both are `true` by default).

```js
await fastify.register(
  import('@fastify/compress'),
  // Disable compression but keep decompression enabled (default behavior for globalDecompression is true)
  { globalCompression: false }
)

// Disable decompression but keep compression enabled
await fastify.register(
  import('@fastify/compress'),
  { globalDecompression: false }
)
```

Fastify encapsulation can be used to set global compression but run it only in a subset of routes by wrapping them inside a plugin.

> ℹ️ Note: If using `@fastify/compress` plugin together with `@fastify/static` plugin, `@fastify/compress` must be registered (with *global hook*) **before** registering `@fastify/static`.

### Per Route options
Different compression options can be specified per route using the `compress` options in the route's configuration.
Setting `compress: false` on any route will disable compression on the route even if global compression is enabled.
```js
await fastify.register(
  import('@fastify/compress'),
  { global: false }
)

// only compress if the payload is above a certain size and use brotli
fastify.get('/custom-route', {
  compress: {
    inflateIfDeflated: true,
    threshold: 128,
    zlib: {
      createBrotliCompress: () => createYourCustomBrotliCompress(),
      createGzip: () => createYourCustomGzip(),
      createDeflate: () => createYourCustomDeflate()
    }
  }, (req, reply) => {
    // ...
  })
```

### `reply.compress`
This plugin adds a `compress` method to `reply` that compresses a stream or string based on the `accept-encoding` header. If a JS object is passed, it will be stringified to JSON.

The `compress` method uses per-route parameters if configured, otherwise it uses global parameters.

```js
import fs from 'node:fs'
import fastify from 'fastify'

const app = fastify()
await app.register(import('@fastify/compress'), { global: false })

app.get('/', (req, reply) => {
  reply
    .type('text/plain')
    .compress(fs.createReadStream('./package.json'))
})

await app.listen({ port: 3000 })
```

It's also possible to pass a Fetch API `Response` object or a Web `ReadableStream`. The plugin will automatically extract the body stream from the `Response` or convert the Web stream to a Node.js `Readable` behind the scenes.

```js
import fastify from 'fastify'

const app = fastify()
await app.register(import('@fastify/compress'), { global: true })

app.get('/', async (req, reply) => {
  const resp = new Response('Hello from Fetch Response')
  reply.compress(resp)
})
```

```js
app.get('/', async (req, reply) => {
  return new Response('Hello from Fetch Response')
})
```

```js
app.get('/', (req, reply) => {
  const stream = new ReadableStream({
    start (controller) {
      controller.enqueue(new TextEncoder().encode('Hello from Web ReadableStream'))
      controller.close()
    }
  })

  reply.header('content-type', 'text/plain')
  reply.compress(stream)
})
```

## Compress Options

### threshold
The minimum byte size for response compression. Defaults to `1024`.
```js
await fastify.register(
  import('@fastify/compress'),
  { threshold: 2048 }
)
```
### customTypes
[mime-db](https://github.com/jshttp/mime-db) determines if a `content-type` should be compressed. Additional content types can be compressed via regex or a function.

```js
await fastify.register(
  import('@fastify/compress'),
  { customTypes: /x-protobuf$/ }
)
```

or

```js
await fastify.register(
  import('@fastify/compress'),
  { customTypes: contentType => contentType.endsWith('x-protobuf') }
)
```

### onUnsupportedEncoding
Set `onUnsupportedEncoding(encoding, request, reply)` to send a custom error response for unsupported encoding. The function can modify the reply and return a `string | Buffer | Stream | Error` payload.

```js
await fastify.register(
  import('@fastify/compress'),
  {
    onUnsupportedEncoding: (encoding, request, reply) => {
      reply.code(406)
      return 'We do not support the ' + encoding + ' encoding.'
    }
  }
)
```

### Disable compression by header
Response compression can be disabled by an `x-no-compression` header in the request.

### Inflate pre-compressed bodies for clients that do not support compression
Optional feature to inflate pre-compressed data if the client does not include one of the supported compression types in its `accept-encoding` header.
```js
await fastify.register(
  import('@fastify/compress'),
  { inflateIfDeflated: true }
)

fastify.get('/file', (req, reply) =>
  // will inflate the file  on the way out for clients
  // that indicate they do not support compression
  reply.send(fs.createReadStream('./file.gz')))
```

### Customize encoding priority
By default, `@fastify/compress` prioritizes compression as described [here](#usage). Change this by passing an array of compression tokens to the `encodings` option:

```js
await fastify.register(
  import('@fastify/compress'),
  // Only support gzip and deflate, and prefer deflate to gzip
  { encodings: ['deflate', 'gzip'] }
)

// Example with zstd support (Node.js 22.15+/23.8+)
await fastify.register(
  import('@fastify/compress'),
  // Prefer zstd, fallback to brotli, then gzip
  { encodings: ['zstd', 'br', 'gzip'] }
)
```

### brotliOptions and zlibOptions
Compression can be tuned with `brotliOptions` and `zlibOptions`, which are passed directly to native node `zlib` methods. See [class definitions](https://nodejs.org/api/zlib.html#zlib_class_options).

```js
  server.register(fastifyCompress, {
    brotliOptions: {
      params: {
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT, // useful for APIs that primarily return text
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4, // default is 4, max is 11, min is 0
      },
    },
    zlibOptions: {
      level: 6, // default is typically 6, max is 9, min is 0
    }
  });
```

### Manage `Content-Length` header removal with removeContentLengthHeader
By default, `@fastify/compress` removes the reply `Content-Length` header. Change this by setting `removeContentLengthHeader` to `false` globally or per route.

```js
  // Global plugin scope
  await server.register(fastifyCompress, { global: true, removeContentLengthHeader: false });

  // Route-specific scope
  fastify.get('/file', {
    compress: { removeContentLengthHeader: false }
  }, (req, reply) =>
    reply.compress(fs.createReadStream('./file.gz'))
  )
```

## Usage - Decompress request payloads
This plugin adds a `preParsing` hook to decompress the request payload based on the `content-encoding` request header.

Currently, the following encoding tokens are supported:

- `zstd` (Node.js 22.15+/23.8+)
- `br`
- `gzip`
- `deflate`

If an unsupported encoding or invalid payload is received, the plugin throws an error.

If the request header is missing, the plugin yields to the next hook.

### Supported payload types

The plugin supports compressing the following payload types:

- Strings and Buffers
- Node.js streams
- Response objects (from the Fetch API)
- ReadableStream objects (from the Web Streams API)

### Global hook

The global request decompression hook is enabled by default. To disable it, pass `{ global: false }`:
```js
await fastify.register(
  import('@fastify/compress'),
  { global: false }
)
```

Fastify encapsulation can be used to set global decompression but run it only in a subset of routes by wrapping them inside a plugin.

### Per Route options

Specify different decompression options per route using the `decompress` options in the route's configuration.
```js
await fastify.register(
  import('@fastify/compress'),
  { global: false }
)

// Always decompress using gzip
fastify.get('/custom-route', {
  decompress: {
    forceRequestEncoding: 'gzip',
    zlib: {
      createBrotliDecompress: () => createYourCustomBrotliDecompress(),
      createGunzip: () => createYourCustomGunzip(),
      createInflate: () => createYourCustomInflate()
    }
  }
}, (req, reply) => {
    // ...
  })
```

### requestEncodings

By default, `@fastify/compress` accepts all encodings specified [here](#usage). Change this by passing an array of compression tokens to the `requestEncodings` option:

```js
await fastify.register(
  import('@fastify/compress'),
  // Only support gzip
  { requestEncodings: ['gzip'] }
)

// Example with zstd support for request decompression (Node.js 22.15+/23.8+)
await fastify.register(
  import('@fastify/compress'),
  // Support zstd, brotli and gzip for request decompression
  { requestEncodings: ['zstd', 'br', 'gzip'] }
)
```

### forceRequestEncoding

By default, `@fastify/compress` chooses the decompression algorithm based on the `content-encoding` header.

One algorithm can be forced, and the header ignored, by providing the `forceRequestEncoding` option.

If the request payload is not compressed, `@fastify/compress` will try to decompress, resulting in an error.

### onUnsupportedRequestEncoding

The response error can be customized for unsupported request payload encoding by setting `onUnsupportedEncoding(request, encoding)` to a function that returns an error.

```js
await fastify.register(
  import('@fastify/compress'),
  {
     onUnsupportedRequestEncoding: (request, encoding) => {
      return {
        statusCode: 415,
        code: 'UNSUPPORTED',
        error: 'Unsupported Media Type',
        message: 'We do not support the ' + encoding + ' encoding.'
      }
    }
  }
)
```

### onInvalidRequestPayload

The response error can be customized for undetectable request payloads by setting `onInvalidRequestPayload(request, encoding)` to a function that returns an error.

```js
await fastify.register(
  import('@fastify/compress'),
  {
    onInvalidRequestPayload: (request, encoding, error) => {
      return {
        statusCode: 400,
        code: 'BAD_REQUEST',
        error: 'Bad Request',
        message: 'This is not a valid ' + encoding + ' encoded payload: ' + error.message
      }
    }
  }
)
```

## Acknowledgments

Past sponsors:

- [LetzDoIt](http://www.letzdoitapp.com/)

## License

Licensed under [MIT](./LICENSE).
