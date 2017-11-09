'use strict'

const fp = require('fastify-plugin')
const zlib = require('zlib')
const brotli = require('iltorb')
const pump = require('pump')
const sts = require('string-to-stream')
const supportedEncodings = ['deflate', 'gzip', 'br']

const compressStream = {
  gzip: zlib.createGzip,
  deflate: zlib.createDeflate,
  br: brotli.compressStream
}

function compressPlugin (fastify, opts, next) {
  fastify.decorateReply('compress', compress)
  next()
}

function compress (payload) {
  if (this.request.headers['x-no-compression'] !== undefined) {
    return this.send(payload)
  }

  if (!payload) {
    this._req.log.warn('compress: missing payload')
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
      payload = JSON.stringify(payload)
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
  if (err) this._req.log.error(err)
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

module.exports = fp(compressPlugin, '>=0.20.0')
