'use strict'

// https://datatracker.ietf.org/doc/html/rfc1950#section-2
function isDeflate (buffer) {
  return (
    typeof buffer === 'object' &&
    buffer !== null &&
    buffer.length > 1 &&
    // CMF
    (
      buffer[0] === 0x78 ||
      buffer[0] === 0x68 ||
      buffer[0] === 0x58 ||
      buffer[0] === 0x48 ||
      buffer[0] === 0x38 ||
      buffer[0] === 0x28 ||
      buffer[0] === 0x18 ||
      buffer[0] === 0x08
    ) &&
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

module.exports = { isGzip, isDeflate, isStream }
