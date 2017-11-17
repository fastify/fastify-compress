'use strict'

const fp = require('fastify-plugin')
const zlib = require('zlib')
const pump = require('pump')
const sts = require('string-to-stream')
const mimedb = require('mime-db')
const supportedEncodings = ['deflate', 'gzip', 'br']
const compressibleTypes = /^text\/|\+json$|\+text$|\+xml$/

const compressStream = {
  gzip: zlib.createGzip,
  deflate: zlib.createDeflate
}

function compressPlugin (fastify, opts, next) {
  fastify.decorateReply('compress', compress)
  if (opts.global === true) {
    fastify.addHook('onSend', onSend)
  }
  if (opts.brotli) {
    compressStream.br = opts.brotli.compressStream
  }
  next()
}

function compress (payload) {
  var type = this.res.getHeader('Content-Type') || 'application/json'
  if (shouldCompress(type) === false) {
    return this.send(payload)
  }

  if (this.request.headers['x-no-compression'] !== undefined) {
    return this.send(payload)
  }

  if (!payload) {
    this.res.log.warn('compress: missing payload')
    this.send(new Error('Internal server error'))
    return
  }

  var encoding = getEncodingHeader(this.request)

  if (encoding === undefined) {
    closeStream(payload)
    this.code(400).send(new Error('Missing `accept encoding` header'))
    return
  }

  if (encoding === null) {
    closeStream(payload)
    this.code(406).send(new Error('Unsupported encoding'))
    return
  }

  if (!payload._readableState) {
    if (typeof payload !== 'string') {
      payload = this.serialize(payload)
    }
    payload = sts(payload)
  }

  this.header('Content-Encoding', encoding)
  this.send(pump(
    payload,
    compressStream[encoding](),
    onEnd.bind(this))
  )
}

function onEnd (err) {
  if (err) this.res.log.error(err)
}

function onSend (req, reply, payload, next) {
  var type = reply.res.getHeader('Content-Type') || 'application/json'
  if (shouldCompress(type) === false) {
    return next()
  }

  if (req.headers['x-no-compression'] !== undefined) {
    return next()
  }

  if (!payload) {
    reply.res.log.warn('compress: missing payload')
    next(new Error('Internal server error'))
    return
  }

  var encoding = getEncodingHeader(req)

  if (encoding === undefined) {
    closeStream(payload)
    reply.code(400)
    next(new Error('Missing `accept encoding` header'))
    return
  }

  if (encoding === null) {
    closeStream(payload)
    reply.code(406)
    next(new Error('Unsupported encoding'))
    return
  }

  if (!payload._readableState) {
    if (typeof payload !== 'string') {
      payload = reply.serialize(payload)
    }
    payload = sts(payload)
  }

  reply.header('Content-Encoding', encoding)
  next(null, pump(
    payload,
    compressStream[encoding](),
    onEnd.bind(reply))
  )
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

function getEncodingHeader (request) {
  var header = request.headers['accept-encoding']
  if (!header) return undefined
  var acceptEncodings = header.split(',')
  for (var i = 0; i < acceptEncodings.length; i++) {
    if (supportedEncodings.indexOf(acceptEncodings[i]) > -1) {
      return acceptEncodings[i]
    }
  }
  return null
}

function shouldCompress (type) {
  if (compressibleTypes.test(type)) return true
  var data = mimedb[type.split(';', 1)[0].trim().toLowerCase()]
  if (data === undefined) return false
  return data.compressible
}

module.exports = fp(compressPlugin, '>=0.20.0')
