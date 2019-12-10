# fastify-compress

[![Greenkeeper badge](https://badges.greenkeeper.io/fastify/fastify-compress.svg)](https://greenkeeper.io/)

[![Build Status](https://travis-ci.org/fastify/fastify-compress.svg?branch=master)](https://travis-ci.org/fastify/fastify-compress) [![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](http://standardjs.com/)

Adds compression utils to [the Fastify `reply` object](https://www.fastify.io/docs/master/Reply/).  
Supports `gzip`, `deflate`, and `brotli`.

## Install
```
npm i fastify-compress
```

## Usage
This plugin adds two functionalities to Fastify: a compress utility and a global compression hook.

Currently, the following encoding tokens are supported, using the first acceptable token in this order:

1. `br`
2. `gzip`
3. `deflate`
4. `*` (no preference — `fastify-compress` will use `gzip`)
5. `identity` (no compression)

If an unsupported encoding is received or if the `'accept-encoding'` header is missing, it will not compress the payload. If an unsupported encoding is received and you would like to return an error, provide an `onUnsupportedEncoding` option.

The plugin automatically decides if a payload should be compressed based on its `content-type`; if no content type is present, it will assume `application/json`.

### Global hook
The global compression hook is enabled by default. To disable it, pass the option `{ global: false }`:
```javascript
fastify.register(
  require('fastify-compress'),
  { global: false }
)
```
Remember that thanks to the Fastify encapsulation model, you can set a global compression, but run it only in a subset of routes if you wrap them inside a plugin.

### Per Route options
You can specify different options for compression per route by passing in the compression options on the route's configuration.
```javascript
fastify.register(
  require('fastify-compress'),
  { global: false }
)

// only compress if the payload is above a certain size and use brotli
fastify.get('/custom-route', {
    config: {
      compress: {
        threshold: 128
        brotli: brotli
      }
    }
  }, (req, reply) => {
    // ...
  })
```

Note: Setting `config.compress = false` on any route will disable compression on the route even if global compression is enabled.

### `reply.compress`
This plugin adds a `compress` method to `reply` that accepts a stream or a string, and compresses it based on the `accept-encoding` header. If a JS object is passed in, it will be stringified to JSON. 
Note that the compress method is configured with either the per route parameters if the route has a custom configuration or with the global parameters if the the route has no custom parameters but
the plugin was defined as global.

```javascript
const fs = require('fs')
const fastify = require('fastify')()

fastify.register(require('fastify-compress'), { global: false })

fastify.get('/', (req, reply) => {
  reply
    .type('text/plain')
    .compress(fs.createReadStream('./package.json'))
})

fastify.listen(3000, function (err) {
  if (err) throw err
  console.log(`server listening on ${fastify.server.address().port}`)
})
```

## Options

### Threshold
The minimum byte size for a response to be compressed. Defaults to `1024`.
```javascript
fastify.register(
  require('fastify-compress'),
  { threshold: 2048 }
)
```
### customTypes
[mime-db](https://github.com/jshttp/mime-db) is used to determine if a `content-type` should be compressed. You can compress additional content types via regular expression.
```javascript
fastify.register(
  require('fastify-compress'),
  { customTypes: /x-protobuf$/ }
)
```
### Brotli
Brotli compression is enabled by default if your Node.js supports it natively (≥ v11.7.0).

For Node.js versions that don’t natively support Brotli, it's not enabled by default. If you need it, we recommend installing [`iltorb`](https://www.npmjs.com/package/iltorb) and passing it to the `brotli` option:

```javascript
fastify.register(
  require('fastify-compress'),
  { brotli: require('iltorb') }
)
```

### onUnsupportedEncoding
When the encoding is not supported, a custom error response can be sent in place of the uncompressed payload by setting the `onUnsupportedEncoding(encoding, request, reply)` option to be a function that can modify the reply and return a `string | Buffer | Stream | Error` payload.
```javascript
fastify.register(
  require('fastify-compress'),
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
Optional feature to inflate pre-compressed data if the client doesn't include one of the supported compression types in its `accept-encoding` header.
```javascript
fastify.register(
  require('fastify-compress'),
  { inflateIfDeflated: true }
)

fastify.get('/file', (req, reply) =>
  // will inflate the file  on the way out for clients
  // that indicate they do not support compression
  reply.send(fs.createReadStream('./file.gz')))
```

### Customize encoding priority

By default, `fastify-compress` prioritizes compression as described [at the beginning of §Usage](#usage). You can change that by passing an array of compression tokens to the `encodings` option:

```javascript
fastify.register(
  require('fastify-compress'),
  // Only support gzip and deflate, and prefer deflate to gzip
  { encodings: ['deflate', 'gzip'] }
)
```

## Note
Please note that in large-scale scenarios, you should use a proxy like Nginx to handle response compression.

## Acknowledgements
This project is kindly sponsored by:
- [LetzDoIt](http://www.letzdoitapp.com/)

## License

Licensed under [MIT](./LICENSE).
