'use strict'

function isStream (stream) {
  return stream !== null && typeof stream === 'object' && typeof stream.pipe === 'function'
}

module.exports = { isStream }
