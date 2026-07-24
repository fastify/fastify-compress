'use strict'

const zlib = require('node:zlib')
const { inherits, format } = require('node:util')
const { pipeline, compose } = require('node:stream')

const fp = require('fastify-plugin')
const encodingNegotiator = require('@fastify/accept-negotiator')
const mimedb = require('mime-db')
const { Minipass } = require('minipass')
const { Readable } = require('readable-stream')

const {
  isStream,
  isGzip,
  isDeflate,
  intoAsyncIterator,
  isWebReadableStream,
  isFetchResponse,
  webStreamToNodeReadable,
  createPeekTransform
} = require('./lib/utils')

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
    // Manage compression options
    if (routeOptions.compress !== undefined) {
      if (typeof routeOptions.compress === 'object') {
        const mergedCompressParams = processCompressParams(routeOptions.compress, globalCompressParams)

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

    // Manage decompression options
    if (routeOptions.decompress !== undefined) {
      if (typeof routeOptions.decompress === 'object') {
        // if the current endpoint has a custom compress configuration ...
        const mergedDecompressParams = processDecompressParams(routeOptions.decompress, globalDecompressParams)

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

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key)
const baseOrDefault = (baseParams, key, defaultValue) => baseParams !== undefined ? baseParams[key] : defaultValue
const optionOrBase = (opts, key, baseParams, defaultValue) => hasOwn(opts, key) ? opts[key] : baseOrDefault(baseParams, key, defaultValue)
const booleanOptionOrBase = (opts, key, baseParams, defaultValue) => typeof opts[key] === 'boolean' ? opts[key] : baseOrDefault(baseParams, key, defaultValue)
const numberOptionOrBase = (opts, key, baseParams, defaultValue) => typeof opts[key] === 'number' ? opts[key] : baseOrDefault(baseParams, key, defaultValue)
const zlibOrBase = (opts, baseParams) => opts.zlib || baseOrDefault(baseParams, 'zlib', zlib)

function globalOptionOrBase (opts, key, baseParams) {
  if (typeof opts[key] === 'boolean') return opts[key]

  if (typeof opts.global === 'boolean') return opts.global

  return baseOrDefault(baseParams, 'global', true)
}

function getBrotliOptions (opts, isGlobal, baseParams) {
  // Route-level compress objects are active compression configs, even when global compression is disabled.
  const useDefaults = isGlobal || baseParams !== undefined

  if (hasOwn(opts, 'brotliOptions')) {
    return useDefaults
      ? { ...recommendedDefaultBrotliOptions, ...opts.brotliOptions }
      : opts.brotliOptions
  }

  if (baseParams !== undefined && baseParams.brotliOptions !== undefined) return baseParams.brotliOptions

  return useDefaults ? { ...recommendedDefaultBrotliOptions } : undefined
}

function getCompressibleTypes (opts, baseParams) {
  if (opts.customTypes instanceof RegExp) return opts.customTypes.test.bind(opts.customTypes)

  if (typeof opts.customTypes === 'function') return opts.customTypes

  if (!hasOwn(opts, 'customTypes') && baseParams !== undefined) return baseParams.compressibleTypes

  return defaultCompressibleTypes.test.bind(defaultCompressibleTypes)
}

function getSupportedEncodings () {
  const supportedEncodings = ['br', 'gzip', 'deflate', 'identity']
  if (typeof zlib.createZstdCompress === 'function') supportedEncodings.unshift('zstd')
  return supportedEncodings
}

function encodingsOrBase (opts, key, baseParams) {
  const supportedEncodings = getSupportedEncodings()

  if (Array.isArray(opts[key])) {
    return supportedEncodings
      .filter(encoding => opts[key].includes(encoding))
      .sort((a, b) => opts[key].indexOf(a) - opts[key].indexOf(b))
  }

  return hasOwn(opts, key) || baseParams === undefined ? supportedEncodings : baseParams.encodings
}

function getCompressStream (customZlib, params) {
  const compressStream = {
    br: () => (customZlib.createBrotliCompress || zlib.createBrotliCompress)(params.brotliOptions),
    gzip: () => (customZlib.createGzip || zlib.createGzip)(params.zlibOptions),
    deflate: () => (customZlib.createDeflate || zlib.createDeflate)(params.zlibOptions)
  }

  if (typeof (customZlib.createZstdCompress || zlib.createZstdCompress) === 'function') compressStream.zstd = () => (customZlib.createZstdCompress || zlib.createZstdCompress)(params.zlibOptions)

  return compressStream
}

function getUncompressStream (customZlib, params) {
  const uncompressStream = {
    // Currently uncompressStream.br() is never called as we do not have any way to autodetect brotli compression in `fastify-compress`
    // Brotli documentation reference: [RFC 7932](https://www.rfc-editor.org/rfc/rfc7932)
    br: /* c8 ignore next */ () => (customZlib.createBrotliDecompress || zlib.createBrotliDecompress)(params.brotliOptions),
    gzip: () => (customZlib.createGunzip || zlib.createGunzip)(params.zlibOptions),
    deflate: () => (customZlib.createInflate || zlib.createInflate)(params.zlibOptions)
  }

  if (typeof (customZlib.createZstdDecompress || zlib.createZstdDecompress) === 'function') {
    // Currently uncompressStream.zstd() is never called as we do not have any way to autodetect zstd compression in `fastify-compress`
    // Zstd documentation reference: [RFC 8878](https://www.rfc-editor.org/rfc/rfc8878)
    uncompressStream.zstd = /* c8 ignore next */ () => (customZlib.createZstdDecompress || zlib.createZstdDecompress)(params.zlibOptions)
  }

  return uncompressStream
}

function getDecompressStream (customZlib) {
  const decompressStream = {
    br: customZlib.createBrotliDecompress || zlib.createBrotliDecompress,
    gzip: customZlib.createGunzip || zlib.createGunzip,
    deflate: customZlib.createInflate || zlib.createInflate
  }

  if (typeof (customZlib.createZstdDecompress || zlib.createZstdDecompress) === 'function') decompressStream.zstd = customZlib.createZstdDecompress || zlib.createZstdDecompress

  return decompressStream
}

const forceEncodingOrBase = (opts, baseParams) => hasOwn(opts, 'forceRequestEncoding')
  ? opts.forceRequestEncoding || null
  : baseOrDefault(baseParams, 'forceEncoding', null)

function processCompressParams (opts, baseParams) {
  /* c8 ignore next 3 */
  if (!opts) {
    return baseParams
  }

  const customZlib = zlibOrBase(opts, baseParams)
  const params = {
    zlib: customZlib,
    global: globalOptionOrBase(opts, 'globalCompression', baseParams),
    removeContentLengthHeader: booleanOptionOrBase(opts, 'removeContentLengthHeader', baseParams, true),
    zlibOptions: optionOrBase(opts, 'zlibOptions', baseParams),
    onUnsupportedEncoding: optionOrBase(opts, 'onUnsupportedEncoding', baseParams),
    inflateIfDeflated: booleanOptionOrBase(opts, 'inflateIfDeflated', baseParams, false),
    threshold: numberOptionOrBase(opts, 'threshold', baseParams, 1024),
    compressibleTypes: getCompressibleTypes(opts, baseParams)
  }

  params.brotliOptions = getBrotliOptions(opts, params.global, baseParams)
  params.compressStream = getCompressStream(customZlib, params)
  params.uncompressStream = getUncompressStream(customZlib, params)
  params.encodings = encodingsOrBase(opts, 'encodings', baseParams)

  return params
}

function processDecompressParams (opts, baseParams) {
  /* c8 ignore next 3 */
  if (!opts) {
    return baseParams
  }

  const customZlib = zlibOrBase(opts, baseParams)

  const params = {
    zlib: customZlib,
    global: globalOptionOrBase(opts, 'globalDecompression', baseParams),
    onUnsupportedRequestEncoding: optionOrBase(opts, 'onUnsupportedRequestEncoding', baseParams),
    onInvalidRequestPayload: optionOrBase(opts, 'onInvalidRequestPayload', baseParams),
    decompressStream: getDecompressStream(customZlib),
    encodings: encodingsOrBase(opts, 'requestEncodings', baseParams),
    forceEncoding: forceEncodingOrBase(opts, baseParams)
  }

  if (params.forceEncoding && params.encodings.includes(params.forceEncoding)) {
    params.encodings = [params.forceEncoding]
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
      // don't compress partial content: Content-Range describes unencoded byte offsets
      (reply.statusCode === 206) ||
      (reply.getHeader('Content-Range') !== undefined) ||
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
        pipeline(stream, payload = unzipStream(params.uncompressStream), onEnd.bind(reply))
      }
      return next(null, payload)
    }

    if (typeof payload.pipe !== 'function') {
      if (isFetchResponse(payload)) {
        payload = payload.body
      }

      if (isWebReadableStream(payload)) {
        payload = webStreamToNodeReadable(payload)
      } else {
        if (Buffer.byteLength(payload) < params.threshold) {
          return next()
        }
        payload = Readable.from(intoAsyncIterator(payload))
      }
    }

    setVaryHeader(reply)
    reply.header('Content-Encoding', encoding)
    if (params.removeContentLengthHeader) {
      reply.removeHeader('content-length')
    }

    stream = zipStream(params.compressStream, encoding)
    pipeline(payload, stream, onEnd.bind(reply))
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

    pipeline(raw, decompresser, () => {
      // Cleanup callback - decompression errors are handled by decompresser's error handler
    })
    next(null, decompresser)
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
        pipeline(stream, payload = unzipStream(params.uncompressStream), onEnd.bind(this))
      }
      return this.send(payload)
    }

    if (typeof payload.pipe !== 'function') {
      if (isFetchResponse(payload)) {
        payload = payload.body
      }

      if (isWebReadableStream(payload)) {
        payload = webStreamToNodeReadable(payload)
      } else if (!Buffer.isBuffer(payload) && typeof payload !== 'string') {
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
    pipeline(payload, stream, onEnd.bind(this))
    return this.send(stream)
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
  // Client disconnection during streaming is expected and handled by Fastify.
  // Do not log "premature close" errors at error level since they are not
  // actual errors - they occur when clients disconnect mid-response.
  // Node's native stream.pipeline emits ERR_STREAM_PREMATURE_CLOSE with the
  // message 'Premature close', while the legacy pump/end-of-stream packages
  // emit 'premature close' without a code, so both variants are checked.
  // See: https://github.com/fastify/fastify-compress/issues/382
  // See: https://github.com/fastify/fastify-compress/issues/410
  if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE' && err.message !== 'premature close') {
    this.log.error(err)
  }
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
  return createPeekTransform(function (data) {
    switch (isCompressed(data)) {
      case 1: return new Minipass()
      case 2: return new Minipass()
    }
    return deflate[encoding]()
  })
}

function unzipStream (inflate, maxRecursion) {
  if (!(maxRecursion >= 0)) maxRecursion = 3
  return createPeekTransform(function (data) {
    // This path is never taken, when `maxRecursion` < 0 it is automatically set back to 3
    /* c8 ignore next */
    if (maxRecursion < 0) throw new Error('Maximum recursion reached')
    switch (isCompressed(data)) {
      case 1: return compose(inflate.gzip(), unzipStream(inflate, maxRecursion - 1))
      case 2: return compose(inflate.deflate(), unzipStream(inflate, maxRecursion - 1))
    }
    return new Minipass()
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
