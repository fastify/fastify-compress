'use strict'

const fp = require('fastify-plugin')
const zlib = require('zlib')
const pump = require('pump')
const mimedb = require('mime-db')
const isStream = require('is-stream')
const intoStream = require('into-stream')
const maybeUnzip = require('unzip-if-zip')

function compressPlugin (fastify, opts, next) {
  fastify.decorateReply('compress', compress)

  if (opts.global !== false) {
    fastify.addHook('onSend', onSend)
  }

  const inflateIfDeflated = opts.inflateIfDeflated === true
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : 1024
  const compressibleTypes = opts.customTypes instanceof RegExp ? opts.customTypes : /^text\/|\+json$|\+text$|\+xml$|octet-stream$/
  const compressStream = {
    gzip: (opts.zlib || zlib).createGzip || zlib.createGzip,
    deflate: (opts.zlib || zlib).createDeflate || zlib.createDeflate
  }

  const supportedEncodings = ['deflate', 'gzip', 'identity']
  if (opts.brotli) {
    compressStream.br = opts.brotli.compressStream
    supportedEncodings.push('br')
  }

  next()

  function compress (payload) {
    if (payload == null) {
      this.res.log.debug('compress: missing payload')
      this.send(new Error('Internal server error'))
      return
    }

    var stream

    if (this.request.headers['x-no-compression'] !== undefined) {
      payload = payloadAsStream(payload, this.serialize.bind(this))
      stream = maybeUnzip()
      pump(payload, stream, onEnd.bind(this))
      return this.send(stream)
    }

    var type = this.getHeader('Content-Type') || 'application/json'
    if (shouldCompress(type, compressibleTypes) === false) {
      payload = payloadAsStream(payload, this.serialize.bind(this))
      stream = maybeUnzip()
      pump(payload, stream, onEnd.bind(this))
      return this.send(stream)
    }

    var encoding = getEncodingHeader(supportedEncodings, this.request)

    if (encoding === undefined || encoding === 'identity') {
      return this.send(payload)
    }

    if (encoding === null) {
      closeStream(payload)
      this.code(406).send(new Error('Unsupported encoding'))
      return
    }

    if (typeof payload.pipe !== 'function') {
      if (!Buffer.isBuffer(payload) && typeof payload !== 'string') {
        payload = this.serialize(payload)
      }
      if (Buffer.byteLength(payload) < threshold) {
        return this.send(payload)
      }
      payload = intoStream(payload)
    }

    this
      .header('Content-Encoding', encoding)
      .removeHeader('content-length')

    stream = compressStream[encoding]()
    pump(payload, stream, onEnd.bind(this))
    this.send(stream)
  }

  function onSend (req, reply, payload, next) {
    if (payload == null) {
      reply.res.log.debug('compress: missing payload')
      return next()
    }

    var stream

    if (req.headers['x-no-compression'] !== undefined) {
      payload = payloadAsStream(payload)
      stream = maybeUnzip()
      pump(payload, stream, onEnd.bind(reply))
      return next(null, stream)
    }

    var type = reply.getHeader('Content-Type') || 'application/json'
    if (shouldCompress(type, compressibleTypes) === false) {
      payload = payloadAsStream(payload)
      stream = maybeUnzip()
      pump(payload, stream, onEnd.bind(reply))
      return next(null, stream)
    }

    var encoding = getEncodingHeader(supportedEncodings, req)

    if (encoding === null) {
      closeStream(payload)
      reply.code(406)
      next(new Error('Unsupported encoding'))
      return
    }

    if (encoding === undefined || encoding === 'identity') {
      return next()
    }

    if (typeof payload.pipe !== 'function') {
      if (Buffer.byteLength(payload) < threshold) {
        return next()
      }
      payload = intoStream(payload)
    }

    reply
      .header('Content-Encoding', encoding)
      .removeHeader('content-length')

    stream = compressStream[encoding]()
    pump(payload, stream, onEnd.bind(reply))
    next(null, stream)
  }
}

function onEnd (err) {
  if (err) this.res.log.error(err)
}

function closeStream (payload) {
  if (typeof payload.close === 'function') {
    payload.close()
  } else if (typeof payload.destroy === 'function') {
    payload.destroy()
  } else if (typeof payload.abort === 'function') {
    payload.abort()
  }
}

function getEncodingHeader (supportedEncodings, request) {
  var header = request.headers['accept-encoding']
  if (!header) return undefined
  var acceptEncodings = header.split(',')
  for (var i = 0; i < acceptEncodings.length; i++) {
    var acceptEncoding = acceptEncodings[i].trim()
    if (supportedEncodings.indexOf(acceptEncoding) > -1) {
      return acceptEncoding
    }
    if (acceptEncoding.indexOf('*') > -1) {
      return 'gzip'
    }
  }
  return null
}

function shouldCompress (type, compressibleTypes) {
  if (compressibleTypes.test(type)) return true
  var data = mimedb[type.split(';', 1)[0].trim().toLowerCase()]
  if (data === undefined) return false
  return data.compressible
}

function payloadAsStream (payload, serialize) {
  var result = payload
  if (isStream(result)) {
    return result
  }
  if (ArrayBuffer.isView(result)) {
    // into-stream only supports Buffers
    return intoStream(Buffer.from(result.buffer, result.byteOffset, result.byteLength))
  }
  return intoStream(serialize && typeof result !== 'string' ? serialize(result) : result)
}

module.exports = fp(compressPlugin, {
  fastify: '>=1.3.0',
  name: 'fastify-compress'
})
