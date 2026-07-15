'use strict'

const { Readable: NodeReadable } = require('node:stream')
const { Transform } = require('readable-stream')

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

function createPeekTransform (swapStream, peekSize = 10) {
  const buffers = []
  let bufferSize = 0
  let downstream = null
  let flushCallback = null

  const _transform = new Transform({
    transform (chunk, encoding, callback) {
      // when downstream already selected, directly passthrough
      if (downstream !== null) return downstream.write(chunk, encoding, callback)

      bufferSize += chunk.length
      buffers.push(chunk)

      // read more data when buffer size smaller than peeksize
      if (bufferSize < peekSize) return callback()

      wireDownStream(callback)
    },
    flush (callback) {
      // used in "end" event to notify the transform finished flush
      flushCallback = callback
      if (downstream !== null) {
        // all data should be flushed to downstream already
        // we end the stream
        downstream.end()
      } else {
        // flush internal buffers and end the downstream
        wireDownStream(() => {
          downstream.end()
        })
      }
    }
  })

  function onData (chunk) {
    _transform.push(chunk)
  }

  function onEnd () {
    flushCallback && flushCallback()
    // cleanup
    downstream.off('data', onData)
    downstream.off('end', onEnd)
    downstream = null
    flushCallback = null

    _transform.push(null)
  }

  function wireDownStream (callback) {
    const data = Buffer.concat(buffers)
    try {
      downstream = swapStream(data.subarray(0, peekSize))
    } catch (error) {
      return callback(error)
    }
    downstream.on('data', onData)
    downstream.on('end', onEnd)
    downstream.write(data, callback)
    // cleanup
    buffers.length = 0
  }

  return _transform
}

module.exports = {
  isZstd,
  isGzip,
  isDeflate,
  isStream,
  intoAsyncIterator,
  isWebReadableStream,
  isFetchResponse,
  webStreamToNodeReadable,
  createPeekTransform
}
