'use strict'

const { Readable: NodeReadable, Transform } = require('node:stream')

// https://datatracker.ietf.org/doc/html/rfc8878#section-3.1.1
function isZstd (buffer) {
  return (
    typeof buffer === 'object' &&
    buffer !== null &&
    buffer.length > 3 &&
    // Zstd magic number: 0xFD2FB528 (little-endian)
    buffer[0] === 0x28 &&
    buffer[1] === 0xb5 &&
    buffer[2] === 0x2f &&
    buffer[3] === 0xfd
  )
}

// https://datatracker.ietf.org/doc/html/rfc1950#section-2
function isDeflate (buffer) {
  return (
    typeof buffer === 'object' &&
    buffer !== null &&
    buffer.length > 1 &&
    // CM = 8 denotes the "deflate" compression method
    (buffer[0] & 0x0f) === 0x08 &&
    // CINFO Values of above 7 are not allowed by RFC 1950
    (buffer[0] & 0x80) === 0 &&
    // The FCHECK value must be such that CMF and FLG, when viewed as
    // a 16-bit unsigned integer stored in MSB order (CMF*256 + FLG),
    // is a multiple of 31.
    (((buffer[0] << 8) + buffer[1]) % 31) === 0
  )
}

// https://datatracker.ietf.org/doc/html/rfc1952#page-6
function isGzip (buffer) {
  return (
    typeof buffer === 'object' &&
    buffer !== null &&
    buffer.length > 2 &&
    // ID1
    buffer[0] === 0x1f &&
    // ID2
    buffer[1] === 0x8b &&
    buffer[2] === 0x08
  )
}

function isStream (stream) {
  return stream !== null && typeof stream === 'object' && typeof stream.pipe === 'function'
}

function isWebReadableStream (obj) {
  return obj instanceof ReadableStream
}

function isFetchResponse (obj) {
  return obj instanceof Response
}

function webStreamToNodeReadable (webStream) {
  return NodeReadable.fromWeb(webStream)
}

/**
 * Provide a async iteratable for Readable.from
 */
async function * intoAsyncIterator (payload) {
  if (typeof payload === 'object') {
    if (Buffer.isBuffer(payload)) {
      yield payload
      return
    }

    if (
      // ArrayBuffer
      payload instanceof ArrayBuffer ||
      // NodeJS.TypedArray
      ArrayBuffer.isView(payload)
    ) {
      yield Buffer.from(payload)
      return
    }

    // Iterator
    if (Symbol.iterator in payload) {
      for (const chunk of payload) {
        yield chunk
      }
      return
    }

    // Async Iterator
    if (Symbol.asyncIterator in payload) {
      for await (const chunk of payload) {
        yield chunk
      }
      return
    }
  }

  // string
  yield payload
}

/**
 * Creates a Transform that lazily selects an inner transform by peeking
 * at the first `maxBuffer` bytes.
 *
 * @param {(data: Buffer) => import('stream').Transform} choose
 *   Called once with the peeked bytes. Must return the transform stream
 *   that all data (including the peeked bytes) will be piped through.
 * @param {number} [maxBuffer=10] - Number of bytes to peek before deciding.
 * @returns {import('stream').Transform}
 */
function createLazyTransform (choose, maxBuffer = 10) {
  let chunks = []
  let chunksLength = 0
  let dest = null

  return new Transform({
    transform (chunk, encoding, cb) {
      if (dest) {
        return dest.write(chunk, encoding, cb)
      }

      chunks.push(chunk)
      chunksLength += chunk.length

      if (chunksLength < maxBuffer) return cb()

      const buf = Buffer.concat(chunks)
      chunks = null

      dest = choose(buf.subarray(0, maxBuffer))
      dest.on('data', (d) => this.push(d))
      dest.on('end', () => this.push(null))
      dest.write(buf, cb)
    },

    flush (cb) {
      if (!dest) {
        const buf = Buffer.concat(chunks)
        chunks = null

        dest = choose(buf)
        dest.on('data', (d) => this.push(d))
        dest.on('end', () => { this.push(null); cb() })
        if (buf.length > 0) {
          dest.end(buf)
        } else {
          dest.end()
        }
        return
      }

      dest.on('end', cb)
      dest.end()
    }
  })
}

module.exports = { isZstd, isGzip, isDeflate, isStream, intoAsyncIterator, isWebReadableStream, isFetchResponse, webStreamToNodeReadable, createLazyTransform }
