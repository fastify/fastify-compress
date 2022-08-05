# @fastify/compress

![CI](https://github.com/fastify/fastify-compress/workflows/CI/badge.svg)
[![NPM version](https://img.shields.io/npm/v/@fastify/compress.svg?style=flat)](https://www.npmjs.com/package/@fastify/compress)
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](https://standardjs.com/)

Adds compression utils to [the Fastify `reply` object](https://www.fastify.io/docs/latest/Reference/Reply/#reply) and a hook to decompress requests payloads.
Supports `gzip`, `deflate`, and `brotli`.

> **Important note:** since `@fastify/compress` version 4.x payloads that are compressed using the `zip` algorithm are not automatically uncompressed anymore. `@fastify/compress` main feature is to provide response compression mechanism to your server, however the `zip` format does not appear in the [IANA maintained Table of Content Encodings](https://www.iana.org/assignments/http-parameters/http-parameters.xml#content-coding) and thus such behavior was out of the scope of this plugin.

## Install
```
npm i @fastify/compress
```

## Usage - Compress replies

This plugin adds two functionalities to Fastify: a compress utility and a global compression hook.

Currently, the following encoding tokens are supported, using the first acceptable token in this order:

1. `br`
2. `gzip`
3. `deflate`
4. `*` (no preference — `@fastify/compress` will use `gzip`)
5. `identity` (no compression)

If an unsupported encoding is received or if the `'accept-encoding'` header is missing, it will not compress the payload. If an unsupported encoding is received and you would like to return an error, provide an `onUnsupportedEncoding` option.

The plugin automatically decides if a payload should be compressed based on its `content-type`; if no content type is present, it will assume `application/json`.

### Global hook
The global compression hook is enabled by default. To disable it, pass the option `{ global: false }`:
```javascript
await fastify.register(
  import('@fastify/compress'),
  { global: false }
)
```
Remember that thanks to the Fastify encapsulation model, you can set a global compression, but run it only in a subset of routes if you wrap them inside a plugin.

Important note! If you are using `@fastify/compress` plugin together with `@fastify/static` plugin, you must register the `@fastify/compress` (with *global hook*) **before** registering `@fastify/static`.

### Per Route options
You can specify different options for compression per route by passing in the `compress` options on the route's configuration.
```javascript
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

Note: Setting `compress = false` on any route will disable compression on the route even if global compression is enabled.

### `reply.compress`
This plugin adds a `compress` method to `reply` that accepts a stream or a string, and compresses it based on the `accept-encoding` header. If a JS object is passed in, it will be stringified to JSON. 
Note that the compress method is configured with either the per route parameters if the route has a custom configuration or with the global parameters if the the route has no custom parameters but
the plugin was defined as global.

```javascript
import fs from 'fs'
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

## Compress Options

### threshold
The minimum byte size for a response to be compressed. Defaults to `1024`.
```javascript
await fastify.register(
  import('@fastify/compress'),
  { threshold: 2048 }
)
```
### customTypes
[mime-db](https://github.com/jshttp/mime-db) is used to determine if a `content-type` should be compressed. You can compress additional content types via regular expression.
```javascript
await fastify.register(
  import('@fastify/compress'),
  { customTypes: /x-protobuf$/ }
)
```

### onUnsupportedEncoding
When the encoding is not supported, a custom error response can be sent in place of the uncompressed payload by setting the `onUnsupportedEncoding(encoding, request, reply)` option to be a function that can modify the reply and return a `string | Buffer | Stream | Error` payload.
```javascript
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
You can selectively disable response compression by using the `x-no-compression` header in the request.

### Inflate pre-compressed bodies for clients that do not support compression
Optional feature to inflate pre-compressed data if the client does not include one of the supported compression types in its `accept-encoding` header.
```javascript
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

By default, `@fastify/compress` prioritizes compression as described [at the beginning of §Usage - Compress replies](#usage). You can change that by passing an array of compression tokens to the `encodings` option:

```javascript
await fastify.register(
  import('@fastify/compress'),
  // Only support gzip and deflate, and prefer deflate to gzip
  { encodings: ['deflate', 'gzip'] }
)
```

### brotliOptions and zlibOptions

You can tune compression by setting the `brotliOptions` and `zlibOptions` properties. These properties are passed directly to native node `zlib` methods, so they should match the corresponding [class](https://nodejs.org/api/zlib.html#zlib_class_brotlioptions) [definitions](https://nodejs.org/api/zlib.html#zlib_class_options).

```javascript
  server.register(fastifyCompress, {
    brotliOptions: {
      params: {
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT, // useful for APIs that primarily return text
        [zlib.constants.BROTLI_PARAM_QUALITY]: 4, // default is 11, max is 11, min is 0
      },
    },
    zlibOptions: {
      level: 6, // default is typically 6, max is 9, min is 0
    }
  });
```

### Manage `Content-Length` header removal with removeContentLengthHeader
By default, `@fastify/compress` removes the reply `Content-Length` header. You can change that by setting the `removeContentLengthHeader` to `false` either on a global scope or on a route specific scope.

```javascript
  // Global plugin scope
  await server.register(fastifyCompress, { global: true, removeContentLengthHeader: false });

  // Route specific scope
  fastify.get('/file', {
    compress: { removeContentLengthHeader: false }
  }, (req, reply) =>
    reply.compress(fs.createReadStream('./file.gz'))
  )
```

## Usage - Decompress request payloads

This plugin adds a `preParsing` hook that decompress the request payload according to the `content-encoding` request header.

Currently, the following encoding tokens are supported:

1. `br`
2. `gzip`
3. `deflate`

If an unsupported encoding or and invalid payload is received, the plugin will throw an error.

If the request header is missing, the plugin will not do anything and yield to the next hook.

### Global hook

The global request decompression hook is enabled by default. To disable it, pass the option `{ global: false }`:
```javascript
await fastify.register(
  import('@fastify/compress'),
  { global: false }
)
```

Remember that thanks to the Fastify encapsulation model, you can set a global decompression, but run it only in a subset of routes if you wrap them inside a plugin.

### Per Route options

You can specify different options for decompression per route by passing in the `decompress` options on the route's configuration.
```javascript
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

By default, `@fastify/compress` accepts all encodings specified [at the beginning of §Usage - Decompress request payloads](#usage). You can change that by passing an array of compression tokens to the `requestEncodings` option:

```javascript
await fastify.register(
  import('@fastify/compress'),
  // Only support gzip
  { requestEncodings: ['gzip'] }
)
```

### forceRequestEncoding

By default, `@fastify/compress` chooses the decompressing algorithm by looking at the `content-encoding` header, if present.

You can force one algorithm and ignore the header at all by providing the `forceRequestEncoding` option.

Note that if the request payload is not compressed, `@fastify/compress` will try to decompress, resulting in an error.

### onUnsupportedRequestEncoding

When the request payload encoding is not supported, you can customize the response error by setting the `onUnsupportedEncoding(request, encoding)` option to be a function that returns an error.

```javascript
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

When the request payload cannot be decompressed using the detected algorithm, you can customize the response error setting the `onInvalidRequestPayload(request, encoding)` option to be a function that returns an error.

```javascript
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

## Note
Please note that in large-scale scenarios, you should use a proxy like Nginx to handle response compression.

## Acknowledgements

Past sponsors:

- [LetzDoIt](http://www.letzdoitapp.com/)

## License

Licensed under [MIT](./LICENSE).
