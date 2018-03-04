# fastify-compress

[![Greenkeeper badge](https://badges.greenkeeper.io/fastify/fastify-compress.svg)](https://greenkeeper.io/)

[![Build Status](https://travis-ci.org/fastify/fastify-compress.svg?branch=master)](https://travis-ci.org/fastify/fastify-compress) [![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](http://standardjs.com/)

Adds compression utils to the Fastify `reply` object.  
Support `gzip`, `deflate` and `brotli`.

## Install
```
npm i fastify-compress --save
```

## Usage
This plugins adds two functionalities to Fastify, a compress utility and a global compression hook.

Currently the following headers are supported:
- `'deflate'`
- `'gzip'`
- `'br'`
- `'*'`

If the `'accept-encoding'` header specifies no preferred encoding with an asterisk `*` the payload will be compressed with `gzip`.

If an unsupported encoding is received, it will automatically return a `406` error, if the `'accept-encoding'` header is missing, it will not compress the payload.

It automatically defines if a payload should be compressed or not based on its `Content-Type`, if no content type is present, it will assume is `application/json`.

### Global hook
The global compression hook is enabled by default if you want to disable it, pass the option `{ global: false }`.
```javascript
fastify.register(
  require('fastify-compress'),
  { global: false }
)
```
Remember that thanks to the Fastify encapsulation model, you can set a global compression, but running it only in a subset of routes is you wrap them inside a plugin.

### `reply.compress`
This plugin add a `compress` function to `reply` that accepts a stream or a string and compress it based on the `'accept-encoding'` header. If a js object is passed in, will be stringified as json.  

```javascript
const fs = require('fs')
const fastify = require('fastify')

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
You can set a custom threshold below which it will not be made compression, default to `1024`.
```javascript
fastify.register(
  require('fastify-compress'),
  { threshold: 2048 }
)
```
### Brotli
Brotli compression is not enabled by default, if you need it we recommend to install [`iltorb`](https://www.npmjs.com/package/iltorb) and pass it as option.
```javascript
fastify.register(
  require('fastify-compress'),
  { brotli: require('iltorb') }
)
```

### Disable compression by header
You can selectively disable the response compression by using the `x-no-compression` header in the request.

## Note
Please have in mind that in large scale scenarios, you should use a proxy like Nginx to handle response-compression.

## Acknowledgements
This project is kindly sponsored by:
- [LetzDoIt](http://www.letzdoitapp.com/)

## License

Licensed under [MIT](./LICENSE).
