'use strict'

const fp = require('fastify-plugin')
const zlib = require('zlib')
const pump = require('pump')
const mimedb = require('mime-db')
const isStream = require('is-stream')
const intoStream = require('into-stream')
const peek = require('peek-stream')
const Minipass = require('minipass')
const pumpify = require('pumpify')
const isGzip = require('is-gzip')
const isZip = require('is-zip')
const unZipper = require('unzipper')
const isDeflate = require('is-deflate')
const encodingNegotiator = require('encoding-negotiator')

function compressPlugin (fastify, opts, next) {
  const globalParams = processParams(opts)

  if (opts.encodings && opts.encodings.length < 1) {
    next(new Error('The `encodings` option array must have at least 1 item.'))
    return
  }

  if (globalParams.encodings.length < 1) {
    next(new Error('None of the passed `encodings` were supported — compression not possible.'))
    return
  }

  fastify.decorateReply('compress', null)

  // add onSend hook onto each route as needed
  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.config && typeof routeOptions.config.compress !== 'undefined') {
      if (typeof routeOptions.config.compress === 'object') {
        const mergedCompressParams = Object.assign({}, globalParams, processParams(routeOptions.config.compress))
        // if the current endpoint has a custom compress configuration ...
        buildRouteCompress(fastify, mergedCompressParams, routeOptions)
      } else if (routeOptions.config.compress === false) {
        // don't apply any compress settings
      } else {
        throw new Error('Unknown value for route compress configuration')
      }
    } else if (globalParams.global) {
      // if the plugin is set globally ( meaning that all the routes will be compressed )
      // As the endpoint, does not have a custom rateLimit configuration, use the global one.
      buildRouteCompress(fastify, globalParams, routeOptions)
    } else {
      // if no options are specified and the plugin is not global, then we still want to decorate
      // the reply in this case
      buildRouteCompress(fastify, globalParams, routeOptions, true)
    }
  })

  next()
}

function processParams (opts) {
  if (!opts) {
    return
  }

  const params = {
    global: (typeof opts.global === 'boolean') ? opts.global : true
  }

  params.onUnsupportedEncoding = opts.onUnsupportedEncoding
  params.inflateIfDeflated = opts.inflateIfDeflated === true
  params.threshold = typeof opts.threshold === 'number' ? opts.threshold : 1024
  params.compressibleTypes = opts.customTypes instanceof RegExp ? opts.customTypes : /^text\/|\+json$|\+text$|\+xml$|octet-stream$/
  params.compressStream = {
    gzip: (opts.zlib || zlib).createGzip || zlib.createGzip,
    deflate: (opts.zlib || zlib).createDeflate || zlib.createDeflate
  }
  params.uncompressStream = {
    gzip: (opts.zlib || zlib).createGunzip || zlib.createGunzip,
    deflate: (opts.zlib || zlib).createInflate || zlib.createInflate
  }

  const supportedEncodings = ['gzip', 'deflate', 'identity']
  if (opts.brotli) {
    params.compressStream.br = opts.brotli.compressStream
    supportedEncodings.unshift('br')
  } else if (zlib.createBrotliCompress) {
    params.compressStream.br = zlib.createBrotliCompress
    supportedEncodings.unshift('br')
  }

  params.encodings = Array.isArray(opts.encodings)
    ? supportedEncodings
      .filter(encoding => opts.encodings.includes(encoding))
      .sort((a, b) => opts.encodings.indexOf(a) - supportedEncodings.indexOf(b))
    : supportedEncodings

  return params
}

function buildRouteCompress (fastify, params, routeOptions, decorateOnly) {
  // In order to provide a compress method with the same parameter set as the route itself has
  // we do the decorate the reply at the start of the request
  if (Array.isArray(routeOptions.onRequest)) {
    routeOptions.onRequest.push(onRequest)
  } else if (typeof routeOptions.onRequest === 'function') {
    routeOptions.onRequest = [routeOptions.onRequest, onRequest]
  } else {
    routeOptions.onRequest = [onRequest]
  }

  const compressFn = compress(params)
  function onRequest (req, reply, next) {
    reply.compress = compressFn
    next()
  }

  if (decorateOnly) {
    return
  }

  if (Array.isArray(routeOptions.onSend)) {
    routeOptions.onSend.push(onSend)
  } else if (typeof routeOptions.onSend === 'function') {
    routeOptions.onSend = [routeOptions.onSend, onSend]
  } else {
    routeOptions.onSend = [onSend]
  }

  function onSend (req, reply, payload, next) {
    if (payload == null) {
      reply.res.log.debug('compress: missing payload')
      return next()
    }

    var stream, encoding
    var noCompress =
      // don't compress on x-no-compression header
      (req.headers['x-no-compression'] !== undefined) ||
      // don't compress if not one of the indicated compressible types
      (shouldCompress(reply.getHeader('Content-Type') || 'application/json', params.compressibleTypes) === false) ||
      // don't compress on missing or identity `accept-encoding` header
      ((encoding = getEncodingHeader(params.encodings, req)) == null || encoding === 'identity')

    if (encoding == null && params.onUnsupportedEncoding != null) {
      var encodingHeader = req.headers['accept-encoding']
      try {
        var errorPayload = params.onUnsupportedEncoding(encodingHeader, reply.request, reply)
        return next(null, errorPayload)
      } catch (err) {
        return next(err)
      }
    }

    if (noCompress) {
      if (params.inflateIfDeflated && isStream(stream = maybeUnzip(payload))) {
        encoding === undefined
          ? reply.removeHeader('Content-Encoding')
          : reply.header('Content-Encoding', 'identity')
        pump(stream, payload = unzipStream(params.uncompressStream), onEnd.bind(reply))
      }
      return next(null, payload)
    }

    if (typeof payload.pipe !== 'function') {
      if (Buffer.byteLength(payload) < params.threshold) {
        return next()
      }
      payload = intoStream(payload)
    }

    reply
      .header('Content-Encoding', encoding)
      .removeHeader('content-length')

    stream = zipStream(params.compressStream, encoding)
    pump(payload, stream, onEnd.bind(reply))
    next(null, stream)
  }
}

function compress (params) {
  return function (payload) {
    if (payload == null) {
      this.res.log.debug('compress: missing payload')
      this.send(new Error('Internal server error'))
      return
    }

    var stream, encoding
    var noCompress =
      // don't compress on x-no-compression header
      (this.request.headers['x-no-compression'] !== undefined) ||
      // don't compress if not one of the indicated compressible types
      (shouldCompress(this.getHeader('Content-Type') || 'application/json', params.compressibleTypes) === false) ||
      // don't compress on missing or identity `accept-encoding` header
      ((encoding = getEncodingHeader(params.encodings, this.request)) == null || encoding === 'identity')

    if (encoding == null && params.onUnsupportedEncoding != null) {
      var encodingHeader = this.request.headers['accept-encoding']

      var errorPayload
      try {
        errorPayload = params.onUnsupportedEncoding(encodingHeader, this.request, this)
      } catch (ex) {
        errorPayload = ex
      }
      return this.send(errorPayload)
    }

    if (noCompress) {
      if (params.inflateIfDeflated && isStream(stream = maybeUnzip(payload, this.serialize.bind(this)))) {
        encoding === undefined
          ? this.removeHeader('Content-Encoding')
          : this.header('Content-Encoding', 'identity')
        pump(stream, payload = unzipStream(params.uncompressStream), onEnd.bind(this))
      }
      return this.send(payload)
    }

    if (typeof payload.pipe !== 'function') {
      if (!Buffer.isBuffer(payload) && typeof payload !== 'string') {
        payload = this.serialize(payload)
      }
    }

    if (typeof payload.pipe !== 'function') {
      if (Buffer.byteLength(payload) < params.threshold) {
        return this.send(payload)
      }
      payload = intoStream(payload)
    }

    this
      .header('Content-Encoding', encoding)
      .removeHeader('content-length')

    stream = zipStream(params.compressStream, encoding)
    pump(payload, stream, onEnd.bind(this))
    this.send(stream)
  }
}

function onEnd (err) {
  if (err) this.res.log.error(err)
}

function getEncodingHeader (encodings, request) {
  let header = request.headers['accept-encoding']
  if (header != null) {
    header = header.toLowerCase()
      .replace('*', 'gzip') // consider the no-preference token as gzip for downstream compat
    return encodingNegotiator.negotiate(header, encodings)
  } else {
    return undefined
  }
}

function shouldCompress (type, compressibleTypes) {
  if (compressibleTypes.test(type)) return true
  var data = mimedb[type.split(';', 1)[0].trim().toLowerCase()]
  if (data === undefined) return false
  return data.compressible === true
}

function isCompressed (data) {
  if (isGzip(data)) return 1
  if (isDeflate(data)) return 2
  if (isZip(data)) return 3
  return 0
}

function maybeUnzip (payload, serialize) {
  if (isStream(payload)) return payload

  var buf = payload; var result = payload

  if (ArrayBuffer.isView(payload)) {
    // Cast non-Buffer DataViews into a Buffer
    buf = result = Buffer.from(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength
    )
  } else if (serialize && typeof payload !== 'string') {
    buf = result = serialize(payload)
  }

  // handle case where serialize doesn't return a string or Buffer
  if (!Buffer.isBuffer(buf)) return result
  if (isCompressed(buf) === 0) return result
  return intoStream(result)
}

function zipStream (deflate, encoding) {
  return peek({ newline: false, maxBuffer: 10 }, function (data, swap) {
    switch (isCompressed(data)) {
      case 1: return swap(null, new Minipass())
      case 2: return swap(null, new Minipass())
    }
    return swap(null, deflate[encoding]())
  })
}

function unzipStream (inflate, maxRecursion) {
  if (!(maxRecursion >= 0)) maxRecursion = 3
  return peek({ newline: false, maxBuffer: 10 }, function (data, swap) {
    if (maxRecursion < 0) return swap(new Error('Maximum recursion reached'))
    switch (isCompressed(data)) {
      case 1: return swap(null, pumpify(inflate.gzip(), unzipStream(inflate, maxRecursion - 1)))
      case 2: return swap(null, pumpify(inflate.deflate(), unzipStream(inflate, maxRecursion - 1)))
      case 3: return swap(null, pumpify(unZipper.ParseOne(), unzipStream(inflate, maxRecursion - 1)))
    }
    return swap(null, new Minipass())
  })
}

module.exports = fp(compressPlugin, {
  fastify: '>=2.11.0',
  name: 'fastify-compress'
})
