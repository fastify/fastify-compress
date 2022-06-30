'use strict'

const { PassThrough, pipeline } = require('stream')
const cloneable = require('cloneable-readable')
const Minipass = require('minipass')

function peek (stream, opts, onpeek) {
  if (stream._readableState === undefined) { 
    console.log('MUAHA')
    stream._readableState = { objectMode: true } // fake support for minipass
  }

  const maxBuffer = typeof opts.maxBuffer === 'number' ? opts.maxBuffer : 65535

  let errored = false
  stream = cloneable(stream)

  const secondClone = stream.clone()
  process.nextTick(() => {
    secondClone.pause()
  })
  secondClone.on('error', onError)
  secondClone.resume()

  const result = new Minipass()

  let chunks = []
  let size = 0
  stream.on('data', function onData (chunk) {
    chunks.push(chunk)
    size += chunk.length
    if (size >= opts.maxBuffer) {
      const buf = Buffer.concat(chunks).slice(0, maxBuffer)
      onLine(buf)
      chunks = null
      stream.removeListener('data', onData)
    }
  })
  stream.on('end', function onEnd () {
    if (chunks) {
      const buf = Buffer.concat(chunks)
      onLine(buf)
    }
  })
  stream.on('error', onError)

  return result

  function onLine (line) {
    try {
      const p = onpeek(line)
      if (typeof p.then === 'function') {
        p.then(onStream, onError)
      } else {
        onStream(p)
      }
    } catch (err) {
      onError(err)
    }
  }

  function onStream (newStream) {
    secondClone.removeListener('error', onError)
    pipeline(secondClone, newStream, result, () => {})

    stream.resume()
  }

  function onError (err) {
    if (errored || chunks === null) {
      return
    }
    errored = true
    result.destroy(err)
  }
}

module.exports = peek
