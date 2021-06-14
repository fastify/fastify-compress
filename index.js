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
const { inherits, format } = require('util')

const InvalidRequestEncodingError = createError('FST_CP_ERR_INVALID_CONTENT_ENCODING', 'Unsupported Content-Encoding: %s', 415)
const InvalidRequestCompressedPayloadError = createError('FST_CP_ERR_INVALID_CONTENT', 'Could not decompress the request payload using the provided encoding', 400)

const compressAdded = Symbol('fastify-compress.added')

function compressPlugin (fastify, opts, next) {
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
    if (routeOptions.config && typeof routeOptions.config.compress !== 'undefined') {
      if (typeof routeOptions.config.compress === 'object') {
        const mergedCompressParams = Object.assign(
          {}, globalCompressParams, processCompressParams(routeOptions.config.compress)
        )

        // if the current endpoint has a custom compress configuration ...
        buildRouteCompress(fastify, mergedCompressParams, routeOptions)
      } else if (routeOptions.config.compress === false) {
        // don't apply any compress settings
      } else {
        throw new Error('Unknown value for route compress configuration')
      }
    } else if (globalCompressParams.global) {
      // if the plugin is set globally ( meaning that all the routes will be compressed )
      // As the endpoint, does not have a custom rateLimit configuration, use the global one.
      buildRouteCompress(fastify, globalCompressParams, routeOptions)
    } else {
      // if no options are specified and the plugin is not global, then we still want to decorate
      // the reply in this case
      buildRouteCompress(fastify, globalCompressParams, routeOptions, true)
    }

    // Manage decompression options
    if (routeOptions.config && typeof routeOptions.config.decompress !== 'undefined') {
      if (typeof routeOptions.config.decompress === 'object') {
        // if the current endpoint has a custom compress configuration ...
        const mergedDecompressParams = Object.assign(
          {}, globalDecompressParams, processDecompressParams(routeOptions.config.decompress)
        )

        buildRouteDecompress(fastify, mergedDecompressParams, routeOptions)
      } else if (routeOptions.config.decompress === false) {
        // don't apply any decompress settings
      } else {
        throw new Error('Unknown value for route decompress configuration')
      }
    } else if (globalDecompressParams.global) {
      // if the plugin is set globally ( meaning that all the routes will be decompressed )
      // As the endpoint, does not have a custom rateLimit configuration, use the global one.
      buildRouteDecompress(fastify, globalDecompressParams, routeOptions)
    }
  })

  next()
}

function processCompressParams (opts) {
  /* istanbul ignore next */
  if (!opts) {
    return
  }

  const params = {
    global: (typeof opts.global === 'boolean') ? opts.global : true
  }

  params.brotliOptions = opts.brotliOptions
  params.zlibOptions = opts.zlibOptions
  params.onUnsupportedEncoding = opts.onUnsupportedEncoding
  params.inflateIfDeflated = opts.inflateIfDeflated === true
  params.threshold = typeof opts.threshold === 'number' ? opts.threshold : 1024
  params.compressibleTypes = opts.customTypes instanceof RegExp ? opts.customTypes : /^text\/(?!event-stream)|\+json$|\+text$|\+xml$|octet-stream$/
  params.compressStream = {
    br: () => ((opts.zlib || zlib).createBrotliCompress || zlib.createBrotliCompress)(params.brotliOptions),
    gzip: () => ((opts.zlib || zlib).createGzip || zlib.createGzip)(params.zlibOptions),
    deflate: () => ((opts.zlib || zlib).createDeflate || zlib.createDeflate)(params.zlibOptions)
  }
  params.uncompressStream = {
    br: () => ((opts.zlib || zlib).createBrotliDecompress || zlib.createBrotliDecompress)(params.brotliOptions),
    gzip: () => ((opts.zlib || zlib).createGunzip || zlib.createGunzip)(params.zlibOptions),
    deflate: () => ((opts.zlib || zlib).createInflate || zlib.createInflate)(params.zlibOptions)
  }

  const supportedEncodings = ['br', 'gzip', 'deflate', 'identity']

  params.encodings = Array.isArray(opts.encodings)
    ? supportedEncodings
        .filter(encoding => opts.encodings.includes(encoding))
        .sort((a, b) => opts.encodings.indexOf(a) - supportedEncodings.indexOf(b))
    : supportedEncodings

  return params
}

function processDecompressParams (opts) {
  /* istanbul ignore next */
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

  const supportedEncodings = ['br', 'gzip', 'deflate', 'identity']

  params.encodings = Array.isArray(opts.requestEncodings)
    ? supportedEncodings
        .filter(encoding => opts.requestEncodings.includes(encoding))
        .sort((a, b) => opts.requestEncodings.indexOf(a) - supportedEncodings.indexOf(b))
    : supportedEncodings

  if (opts.forceRequestEncoding) {
    params.forceEncoding = opts.forceRequestEncoding

    if (params.encodings.includes(opts.forceRequestEncoding)) {
      params.encodings = [opts.forceRequestEncoding]
    }
  }

  return params
}

function buildRouteCompress (fastify, params, routeOptions, decorateOnly) {
  // This methods works by altering the routeOptions, it has side effects.
  // There is the possibility that the same options are set for more than
  // one route, so we just need to make sure that the hook is addded only
  // once.
  if (routeOptions[compressAdded]) {
    return
  }

  routeOptions[compressAdded] = true

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
      return next()
    }
    const responseEncoding = reply.getHeader('Content-Encoding')
    if (responseEncoding && responseEncoding !== 'identity') {
      // response is already compressed
      return next()
    }
    setVaryHeader(reply)

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

function buildRouteDecompress (fastify, params, routeOptions) {
  // Add our decompress handler in the preParsing hook
  if (Array.isArray(routeOptions.preParsing)) {
    routeOptions.preParsing.unshift(preParsing)
  } else if (typeof routeOptions.preParsing === 'function') {
    routeOptions.preParsing = [preParsing, routeOptions.preParsing]
  } else {
    routeOptions.preParsing = [preParsing]
  }

  function preParsing (request, reply, raw, next) {
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
        } catch (ex) {
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

    // Prepare decompression - If there is an decompress error, prepare the error for fastify handing
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

    setVaryHeader(this)
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

function setVaryHeader (reply) {
  if (reply.hasHeader('Vary')) {
    const varyHeader = Array.isArray(reply.getHeader('Vary')) ? reply.getHeader('Vary') : [reply.getHeader('Vary')]
    if (!varyHeader.some((h) => h.includes('accept-encoding'))) {
      reply.header('Vary', `${varyHeader.join(', ')}, accept-encoding`)
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
    } catch (ex) {
      errorPayload = undefined
    }
  }

  if (!errorPayload) {
    errorPayload = new InvalidRequestCompressedPayloadError()
  }

  error.decompressError = error
  Object.assign(error, errorPayload)
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
  const data = mimedb[type.split(';', 1)[0].trim().toLowerCase()]
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

  /* istanbul ignore next */
  FastifyCompressError.prototype.toString = function () {
    return `${this.name} [${this.code}]: ${this.message}`
  }

  inherits(FastifyCompressError, Error)

  return FastifyCompressError
}

module.exports = fp(compressPlugin, {
  fastify: '3.x',
  name: 'fastify-compress'
})
