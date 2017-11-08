'use strict'

const fp = require('fastify-plugin')
const zlib = require('zlib')
const brotli = require('iltorb')
const pump = require('pump')

function compressPlugin (fastify, opts, next) {
  fastify.decorateReply('compress', compress)

  function compress (payload) {
    if (!payload || payload._readableState === undefined) {
      this._req.log.warn(new Error('The payload is not a stream'))
      this.send(new Error('Internal server error'))
      return
    }

    var acceptEncoding = this.request.headers['accept-encoding']
    // deflate compression
    if (/\bdeflate\b/.test(acceptEncoding)) {
      this.header('Content-Encoding', 'deflate')
      this.send(pump(payload, zlib.createDeflate(), onEnd))
    // gzip compression
    } else if (/\bgzip\b/.test(acceptEncoding)) {
      this.header('Content-Encoding', 'gzip')
      this.send(pump(payload, zlib.createDeflate(), onEnd))
    // brotli compression
    } else if (/\bbr\b/.test(acceptEncoding)) {
      this.header('Content-Encoding', 'gzip')
      this.send(pump(payload, brotli.compressStream(), onEnd))
    // all the other cases
    } else {
      // close the stream to avoid leaks
      if (payload.close) {
        payload.close()
      } else if (payload.destroy) {
        payload.destroy()
      } else if (payload.abort) {
        payload.abort()
      }
      this.code(406).send(new Error('Unsupported encoding'))
    }

    function onEnd (err) {
      if (err) this._req.log.error(err)
    }
  }

  next()
}

module.exports = fp(compressPlugin, '>=0.20.0')
