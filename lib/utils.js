'use strict'

const { Readable: NodeReadable, Duplex } = require('node:stream')

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
 * Creates a Duplex stream that buffers the first `maxBuffer` bytes before
 * invoking `onpeek` with the peeked data. The callback receives a swap
 * function to provide a destination transform stream that all data
 * (including the peeked bytes) will be piped through.
 *
 * @param {number} maxBuffer - Number of bytes to buffer before peeking.
 * @param {(data: Buffer, swap: (err: Error | null, stream: import('stream').Transform) => void) => void} onpeek
 *   Callback invoked once `maxBuffer` bytes have been buffered (or the stream ends).
 *   Call `swap(null, stream)` to provide the destination transform stream.
 * @returns {import('stream').Duplex}
 */
function createPeekStream (maxBuffer, onpeek) {
  let buf = Buffer.alloc(0)
  let dest = null

  return new Duplex({
    write (chunk, encoding, cb) {
      if (dest) {
        return dest.write(chunk, encoding, cb)
      }

      buf = Buffer.concat([buf, chunk])

      if (buf.length < maxBuffer) return cb()

      const peekData = buf.slice(0, maxBuffer)
      const remainder = buf.slice(maxBuffer)

      onpeek(peekData, (err, stream) => {
        if (err) return cb(err)
        dest = stream
        dest.on('data', (d) => this.push(d))
        dest.on('end', () => this.push(null))
        if (remainder.length > 0) {
          dest.write(peekData)
          dest.write(remainder, cb)
        } else {
          dest.write(peekData, cb)
        }
        buf = null
      })
    },

    final (cb) {
      if (dest) {
        dest.end(cb)
        return
      }

      onpeek(buf, (err, stream) => {
        if (err) return cb(err)
        dest = stream
        dest.on('data', (d) => this.push(d))
        dest.on('end', () => { this.push(null); cb() })
        if (buf && buf.length > 0) {
          dest.end(buf)
        } else {
          dest.end()
        }
        buf = null
      })
    },

    read () {}
  })
}

module.exports = { isZstd, isGzip, isDeflate, isStream, intoAsyncIterator, isWebReadableStream, isFetchResponse, webStreamToNodeReadable, createPeekStream }
