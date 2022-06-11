'use strict'

function isDeflate (buffer) {
  return (
    typeof buffer === 'object' &&
    buffer !== null &&
    buffer.length > 1 &&
    buffer[0] === 0x78 &&
    (buffer[1] === 1 || buffer[1] === 0x9c || buffer[1] === 0xda)
  )
}

function isGzip (buffer) {
  return (
    typeof buffer === 'object' &&
    buffer !== null &&
    buffer.length > 2 &&
    buffer[0] === 0x1f &&
    buffer[1] === 0x8b &&
    buffer[2] === 0x08
  )
}

function isStream (stream) {
  return stream !== null && typeof stream === 'object' && typeof stream.pipe === 'function'
}

module.exports = { isGzip, isDeflate, isStream }
