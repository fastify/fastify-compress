'use strict'

const fp = require('fastify-plugin')
const zlib = require('zlib')
const brotli = require('iltorb')
const pump = require('pump')
const supportedEncodings = ['deflate', 'gzip', 'br']

function compressPlugin (fastify, opts, next) {
  fastify.decorateReply('compress', compress)
  next()
}

function compress (payload) {
  if (!payload || payload._readableState === undefined) {
    this._req.log.warn(new Error('The payload is not a stream'))
    this.send(new Error('Internal server error'))
    return
  }

  var header = this.request.headers['accept-encoding']
  if (!header) {
    closeStream(payload)
    this.code(400).send(new Error('Missing `accept encoding` header'))
    return
  }
  var encoding = null
  var acceptEncodings = header.split(',')
  for (var i = 0; i < acceptEncodings.length; i++) {
    if (supportedEncodings.indexOf(acceptEncodings[i]) > -1) {
      encoding = acceptEncodings[i]
      break
    }
  }

  if (encoding === null) {
    closeStream(payload)
    this.code(406).send(new Error('Unsupported encoding'))
    return
  }

  // deflate compression
  if (encoding === 'deflate') {
    this.header('Content-Encoding', 'deflate')
    this.send(pump(payload, zlib.createDeflate(), onEnd.bind(this)))
  // gzip compression
  } else if (encoding === 'gzip') {
    this.header('Content-Encoding', 'gzip')
    this.send(pump(payload, zlib.createGzip(), onEnd.bind(this)))
  // brotli compression
  } else if (encoding === 'br') {
    this.header('Content-Encoding', 'br')
    this.send(pump(payload, brotli.compressStream(), onEnd.bind(this)))
  }
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

module.exports = fp(compressPlugin, '>=0.20.0')
