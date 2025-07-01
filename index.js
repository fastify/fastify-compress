'use strict'

const zlib = require('node:zlib')
const { inherits, format } = require('node:util')

const fp = require('fastify-plugin')
const encodingNegotiator = require('@fastify/accept-negotiator')
const pump = require('pump')
const mimedb = require('mime-db')
const peek = require('peek-stream')
const { Minipass } = require('minipass')
const pumpify = require('pumpify')
const { Readable } = require('readable-stream')

const { isStream, isGzip, isDeflate, intoAsyncIterator } = require('./lib/utils')

const InvalidRequestEncodingError = createError('FST_CP_ERR_INVALID_CONTENT_ENCODING', 'Unsupported Content-Encoding: %s', 415)
const InvalidRequestCompressedPayloadError = createError('FST_CP_ERR_INVALID_CONTENT', 'Could not decompress the request payload using the provided encoding', 400)

function fastifyCompress (fastify, opts, next) {
  const globalCompressParams = processCompressParams(opts)
  const globalDecompressParams = processDecompressParams(opts)

  if (opts.encodings && opts.encodings.length < 1) {
    next(new Error('The `encodings` option array must have at least 1 item.'))
    return
  }

  if (opts.requestEncodings && opts.requestEncodings.length < 1) {
    next(new Error('The `requestEncodings` option array must have at least 1 item.'))
    return
  }

  if (globalCompressParams.encodings.length < 1) {
    next(new Error('None of the passed `encodings` were supported — compression not possible.'))
    return
  }

  if (globalDecompressParams.encodings.length < 1) {
    next(new Error('None of the passed `requestEncodings` were supported — request decompression not possible.'))
    return
  }

  if (globalDecompressParams.forceEncoding && !globalDecompressParams.encodings.includes(globalDecompressParams.forceEncoding)) {
    next(new Error(`Unsupported decompression encoding ${opts.forceRequestEncoding}.`))
    return
  }

  fastify.decorateReply('compress', null)

  // add onSend hook onto each route as needed
  fastify.addHook('onRoute', (routeOptions) => {
    // If route config.compress has been set it takes precedence over compress
    if (routeOptions.config?.compress !== undefined) {
      routeOptions.compress = routeOptions.config.compress
    }

    // Manage compression options
    if (routeOptions.compress !== undefined) {
      if (typeof routeOptions.compress === 'object') {
        const mergedCompressParams = Object.assign(
          {}, globalCompressParams, processCompressParams(routeOptions.compress)
        )

        // if the current endpoint has a custom compress configuration ...
        buildRouteCompress(fastify, mergedCompressParams, routeOptions)
      } else if (routeOptions.compress === false) {
        // don't apply any compress settings
      } else {
        throw new Error('Unknown value for route compress configuration')
      }
    } else if (globalCompressParams.global) {
      // if the plugin is set globally (meaning that all the routes will be compressed)
      // As the endpoint, does not have a custom rateLimit configuration, use the global one.
      buildRouteCompress(fastify, globalCompressParams, routeOptions)
    } else {
      // if no options are specified and the plugin is not global, then we still want to decorate
      // the reply in this case
      buildRouteCompress(fastify, globalCompressParams, routeOptions, true)
    }

    // If route config.decompress has been set it takes precedence over compress
    if (routeOptions.config?.decompress !== undefined) {
      routeOptions.decompress = routeOptions.config.decompress
    }

    // Manage decompression options
    if (routeOptions.decompress !== undefined) {
      if (typeof routeOptions.decompress === 'object') {
        // if the current endpoint has a custom compress configuration ...
        const mergedDecompressParams = Object.assign(
          {}, globalDecompressParams, processDecompressParams(routeOptions.decompress)
        )

        buildRouteDecompress(fastify, mergedDecompressParams, routeOptions)
      } else if (routeOptions.decompress === false) {
        // don't apply any decompress settings
      } else {
        throw new Error('Unknown value for route decompress configuration')
      }
    } else if (globalDecompressParams.global) {
      // if the plugin is set globally (meaning that all the routes will be decompressed)
      // As the endpoint, does not have a custom rateLimit configuration, use the global one.
      buildRouteDecompress(fastify, globalDecompressParams, routeOptions)
    }
  })

  next()
}

const defaultCompressibleTypes = /^text\/(?!event-stream)|(?:\+|\/)json(?:;|$)|(?:\+|\/)text(?:;|$)|(?:\+|\/)xml(?:;|$)|octet-stream(?:;|$)/u
const recommendedDefaultBrotliOptions = {
  params: {
    // Default of 4 as 11 has a heavy impact on performance.
    // https://blog.cloudflare.com/this-is-brotli-from-origin#testing
    [zlib.constants.BROTLI_PARAM_QUALITY]: 4
  }
}

function processCompressParams (opts) {
  /* c8 ignore next 3 */
  if (!opts) {
    return
  }

  const params = {
    global: (typeof opts.global === 'boolean') ? opts.global : true
  }

  params.removeContentLengthHeader = typeof opts.removeContentLengthHeader === 'boolean' ? opts.removeContentLengthHeader : true
  params.brotliOptions = params.global
    ? { ...recommendedDefaultBrotliOptions, ...opts.brotliOptions }
    : opts.brotliOptions
  params.zlibOptions = opts.zlibOptions
  params.onUnsupportedEncoding = opts.onUnsupportedEncoding
  params.inflateIfDeflated = opts.inflateIfDeflated === true
  params.threshold = typeof opts.threshold === 'number' ? opts.threshold : 1024
  params.compressibleTypes = opts.customTypes instanceof RegExp
    ? opts.customTypes.test.bind(opts.customTypes)
    : typeof opts.customTypes === 'function'
      ? opts.customTypes
      : defaultCompressibleTypes.test.bind(defaultCompressibleTypes)
  params.compressStream = {
    br: () => ((opts.zlib || zlib).createBrotliCompress || zlib.createBrotliCompress)(params.brotliOptions),
    gzip: () => ((opts.zlib || zlib).createGzip || zlib.createGzip)(params.zlibOptions),
    deflate: () => ((opts.zlib || zlib).createDeflate || zlib.createDeflate)(params.zlibOptions)
  }
  if (typeof ((opts.zlib || zlib).createZstdCompress || zlib.createZstdCompress) === 'function') {
    params.compressStream.zstd = () => ((opts.zlib || zlib).createZstdCompress || zlib.createZstdCompress)(params.zlibOptions)
  }
  params.uncompressStream = {
    // Currently params.uncompressStream.br() is never called as we do not have any way to autodetect brotli compression in `fastify-compress`
    // Brotli documentation reference: [RFC 7932](https://www.rfc-editor.org/rfc/rfc7932)
    br: /* c8 ignore next */ () => ((opts.zlib || zlib).createBrotliDecompress || zlib.createBrotliDecompress)(params.brotliOptions),
    gzip: () => ((opts.zlib || zlib).createGunzip || zlib.createGunzip)(params.zlibOptions),
    deflate: () => ((opts.zlib || zlib).createInflate || zlib.createInflate)(params.zlibOptions)
  }
  if (typeof ((opts.zlib || zlib).createZstdDecompress || zlib.createZstdDecompress) === 'function') {
    // Currently params.uncompressStream.zstd() is never called as we do not have any way to autodetect zstd compression in `fastify-compress`
    // Zstd documentation reference: [RFC 8878](https://www.rfc-editor.org/rfc/rfc8878)
    params.uncompressStream.zstd = /* c8 ignore next */ () => ((opts.zlib || zlib).createZstdDecompress || zlib.createZstdDecompress)(params.zlibOptions)
  }

  const supportedEncodings = ['br', 'gzip', 'deflate', 'identity']
  if (typeof zlib.createZstdCompress === 'function') {
    supportedEncodings.unshift('zstd')
  }

  params.encodings = Array.isArray(opts.encodings)
    ? supportedEncodings
      .filter(encoding => opts.encodings.includes(encoding))
      .sort((a, b) => opts.encodings.indexOf(a) - opts.encodings.indexOf(b))
    : supportedEncodings

  return params
}

function processDecompressParams (opts) {
  /* c8 ignore next 3 */
  if (!opts) {
    return
  }

  const customZlib = opts.zlib || zlib

  const params = {
    global: (typeof opts.global === 'boolean') ? opts.global : true,
    onUnsupportedRequestEncoding: opts.onUnsupportedRequestEncoding,
    onInvalidRequestPayload: opts.onInvalidRequestPayload,
    decompressStream: {
      br: customZlib.createBrotliDecompress || zlib.createBrotliDecompress,
      gzip: customZlib.createGunzip || zlib.createGunzip,
      deflate: customZlib.createInflate || zlib.createInflate
    },
    encodings: [],
    forceEncoding: null
  }
  if (typeof (customZlib.createZstdDecompress || zlib.createZstdDecompress) === 'function') {
    params.decompressStream.zstd = customZlib.createZstdDecompress || zlib.createZstdDecompress
  }

  const supportedEncodings = ['br', 'gzip', 'deflate', 'identity']
  if (typeof zlib.createZstdCompress === 'function') {
    supportedEncodings.unshift('zstd')
  }

  params.encodings = Array.isArray(opts.requestEncodings)
    ? supportedEncodings
      .filter(encoding => opts.requestEncodings.includes(encoding))
      .sort((a, b) => opts.requestEncodings.indexOf(a) - opts.requestEncodings.indexOf(b))
    : supportedEncodings

  if (opts.forceRequestEncoding) {
    params.forceEncoding = opts.forceRequestEncoding

    if (params.encodings.includes(opts.forceRequestEncoding)) {
      params.encodings = [opts.forceRequestEncoding]
    }
  }

  return params
}

function buildRouteCompress (_fastify, params, routeOptions, decorateOnly) {
  // In order to provide a compress method with the same parameter set as the route itself,
  // we decorate the reply at the start of the request
  if (Array.isArray(routeOptions.onRequest)) {
    routeOptions.onRequest.push(onRequest)
  } else if (typeof routeOptions.onRequest === 'function') {
    routeOptions.onRequest = [routeOptions.onRequest, onRequest]
  } else {
    routeOptions.onRequest = [onRequest]
  }

  const compressFn = compress(params)
  function onRequest (_req, reply, next) {
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
      return next()
    }
    const responseEncoding = reply.getHeader('Content-Encoding')
    if (responseEncoding && responseEncoding !== 'identity') {
      // response is already compressed
      return next()
    }

    let stream, encoding
    const noCompress =
      // don't compress on x-no-compression header
      (req.headers['x-no-compression'] !== undefined) ||
      // don't compress if not one of the indicated compressible types
      (shouldCompress(reply.getHeader('Content-Type') || 'application/json', params.compressibleTypes) === false) ||
      // don't compress on missing or identity `accept-encoding` header
      ((encoding = getEncodingHeader(params.encodings, req)) == null || encoding === 'identity')

    if (encoding == null && params.onUnsupportedEncoding != null) {
      const encodingHeader = req.headers['accept-encoding']
      try {
        const errorPayload = params.onUnsupportedEncoding(encodingHeader, reply.request, reply)
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
      payload = Readable.from(intoAsyncIterator(payload))
    }

    setVaryHeader(reply)
    reply.header('Content-Encoding', encoding)
    if (params.removeContentLengthHeader) {
      reply.removeHeader('content-length')
    }

    stream = zipStream(params.compressStream, encoding)
    pump(payload, stream, onEnd.bind(reply))
    next(null, stream)
  }
}

function buildRouteDecompress (_fastify, params, routeOptions) {
  // Add our decompress handler in the preParsing hook
  if (Array.isArray(routeOptions.preParsing)) {
    routeOptions.preParsing.unshift(preParsing)
  } else if (typeof routeOptions.preParsing === 'function') {
    routeOptions.preParsing = [preParsing, routeOptions.preParsing]
  } else {
    routeOptions.preParsing = [preParsing]
  }

  function preParsing (request, _reply, raw, next) {
    // Get the encoding from the options or from the headers
    let encoding = params.forceEncoding

    if (!encoding) {
      encoding = request.headers['content-encoding']
    }

    // The request is not compressed, nothing to do here
    if (!encoding) {
      return next(null, raw)
    }

    // Check that encoding is supported
    if (!params.encodings.includes(encoding)) {
      let errorPayload

      if (params.onUnsupportedRequestEncoding) {
        try {
          errorPayload = params.onUnsupportedRequestEncoding(encoding, request)
        } catch {
          errorPayload = undefined
        }
      }

      if (!errorPayload) {
        errorPayload = new InvalidRequestEncodingError(encoding)
      }

      return next(errorPayload)
    }

    // No action on identity
    if (encoding === 'identity') {
      return next(null, raw)
    }

    // Prepare decompression - If there is a decompress error, prepare the error for fastify handing
    const decompresser = params.decompressStream[encoding]()
    decompresser.receivedEncodedLength = 0
    decompresser.on('error', onDecompressError.bind(this, request, params, encoding))
    decompresser.pause()

    // Track length of encoded length to handle receivedEncodedLength
    raw.on('data', trackEncodedLength.bind(decompresser))
    raw.on('end', removeEncodedLengthTracking)

    next(null, pump(raw, decompresser))
  }
}

function compress (params) {
  return function (payload) {
    if (payload == null) {
      this.send(new Error('Internal server error'))
      return
    }

    let stream, encoding
    const noCompress =
      // don't compress on x-no-compression header
      (this.request.headers['x-no-compression'] !== undefined) ||
      // don't compress if not one of the indicated compressible types
      (shouldCompress(this.getHeader('Content-Type') || 'application/json', params.compressibleTypes) === false) ||
      // don't compress on missing or identity `accept-encoding` header
      ((encoding = getEncodingHeader(params.encodings, this.request)) == null || encoding === 'identity')

    if (encoding == null && params.onUnsupportedEncoding != null) {
      const encodingHeader = this.request.headers['accept-encoding']

      let errorPayload
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
      payload = Readable.from(intoAsyncIterator(payload))
    }

    setVaryHeader(this)
    this.header('Content-Encoding', encoding)
    if (params.removeContentLengthHeader) {
      this.removeHeader('content-length')
    }

    stream = zipStream(params.compressStream, encoding)
    pump(payload, stream, onEnd.bind(this))
    this.send(stream)
  }
}

function setVaryHeader (reply) {
  if (reply.hasHeader('Vary')) {
    const rawHeaderValue = reply.getHeader('Vary')
    const headerValueArray = Array.isArray(rawHeaderValue) ? rawHeaderValue : [rawHeaderValue]
    if (!headerValueArray.some((h) => h.includes('accept-encoding'))) {
      reply.header('Vary', headerValueArray.concat('accept-encoding').join(', '))
    }
  } else {
    reply.header('Vary', 'accept-encoding')
  }
}

function onEnd (err) {
  if (err) this.log.error(err)
}

function trackEncodedLength (chunk) {
  this.receivedEncodedLength += chunk.length
}

function removeEncodedLengthTracking () {
  this.removeListener('data', trackEncodedLength)
  this.removeListener('end', removeEncodedLengthTracking)
}

function onDecompressError (request, params, encoding, error) {
  this.log.debug(`compress: invalid request payload - ${error}`)

  let errorPayload

  if (params.onInvalidRequestPayload) {
    try {
      errorPayload = params.onInvalidRequestPayload(encoding, request, error)
    } catch {
      errorPayload = undefined
    }
  }

  if (!errorPayload) {
    errorPayload = new InvalidRequestCompressedPayloadError()
  }

  error.decompressError = error
  Object.assign(error, errorPayload)
}

const gzipAlias = /\*|x-gzip/gu

function getEncodingHeader (encodings, request) {
  let header = request.headers['accept-encoding']
  if (header != null) {
    header = header.toLowerCase()
      // consider the no-preference token as gzip for downstream compat
      // and x-gzip as an alias of gzip
      // ref.: [HTTP/1.1 RFC 7230 section 4.2.3](https://datatracker.ietf.org/doc/html/rfc7230#section-4.2.3)
      .replace(gzipAlias, 'gzip')
    return encodingNegotiator.negotiate(header, encodings)
  } else {
    return undefined
  }
}

function shouldCompress (type, compressibleTypes) {
  if (compressibleTypes(type)) return true
  const data = mimedb[type.split(';', 1)[0].trim().toLowerCase()]
  if (data === undefined) return false
  return data.compressible === true
}

function isCompressed (data) {
  if (isGzip(data)) return 1
  if (isDeflate(data)) return 2
  return 0
}

function maybeUnzip (payload, serialize) {
  if (isStream(payload)) return payload

  let buf = payload; let result = payload

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
  return Readable.from(intoAsyncIterator(result))
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
    // This path is never taken, when `maxRecursion` < 0 it is automatically set back to 3
    /* c8 ignore next */
    if (maxRecursion < 0) return swap(new Error('Maximum recursion reached'))
    switch (isCompressed(data)) {
      case 1: return swap(null, pumpify(inflate.gzip(), unzipStream(inflate, maxRecursion - 1)))
      case 2: return swap(null, pumpify(inflate.deflate(), unzipStream(inflate, maxRecursion - 1)))
    }
    return swap(null, new Minipass())
  })
}

function createError (code, message, statusCode) {
  code = code.toUpperCase()

  function FastifyCompressError (a) {
    Error.captureStackTrace(this, FastifyCompressError)
    this.name = 'FastifyCompressError'
    this.code = code

    if (a) {
      this.message = format(message, a)
    } else {
      this.message = message
    }

    this.statusCode = statusCode
  }

  FastifyCompressError.prototype[Symbol.toStringTag] = 'Error'

  /* c8 ignore next 3 */
  FastifyCompressError.prototype.toString = function () {
    return `${this.name} [${this.code}]: ${this.message}`
  }

  inherits(FastifyCompressError, Error)

  return FastifyCompressError
}

module.exports = fp(fastifyCompress, {
  fastify: '5.x',
  name: '@fastify/compress'
})
module.exports.default = fastifyCompress
module.exports.fastifyCompress = fastifyCompress
