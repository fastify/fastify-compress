'use string'

const peek = require('../lib/peek')
const { test } = require('tap')
const concat = require('concat-stream')
const { Readable, Transform } = require('stream')

function uppercase (data, enc, cb) {
  cb(null, data.toString().toUpperCase())
}

test('swap to uppercase', function (t) {
  const r = Readable.from([
    Buffer.from('hello\n'),
    Buffer.from('world\n')
  ])
  const p = peek(r, function (data) {
    t.same(data, Buffer.from('hello\nworld\n'))
    return new Transform({ transform: uppercase })
  })

  p.pipe(concat(function (data) {
    t.same(data.toString(), 'HELLO\nWORLD\n')
    t.end()
  }))
})

test('error', function (t) {
  const r = Readable.from([
    Buffer.from('hello\n'),
    Buffer.from('world\n')
  ])
  const p = peek(r, function (data) {
    throw new Error('kaboom')
  })

  p.on('error', function (err) {
    t.equal(err.message, 'kaboom')
    t.end()
  })
})

test('error in the original stream', function (t) {
  const r = new Readable({
    read () {
      this.destroy(new Error('kaboom'))
    }
  })
  const p = peek(r, function (data) {
    t.fail('should not be called')
  })

  p.on('error', function (err) {
    t.equal(err.message, 'kaboom')
    t.end()
  })
  p.resume()
})

test('end of stream', function (t) {
  const r = Readable.from([
    Buffer.from('hello'),
    Buffer.from('world')
  ])
  const p = peek(r, async function (data) {
    t.same(data, Buffer.from('helloworld'))
    return new Transform({ transform: uppercase })
  })

  p.pipe(concat(function (data) {
    t.same(data.toString(), 'HELLOWORLD')
    t.end()
  }))
})

test('binary with maxBuffer', function (t) {
  const r = Readable.from([
    Buffer.from('hello'),
    Buffer.from('world')
  ])
  const p = peek(r, { maxBuffer: 5 }, async function (data) {
    t.same(data, Buffer.from('hello'))
    return new Transform({ transform: uppercase })
  })

  p.pipe(concat(function (data) {
    t.same(data.toString(), 'HELLOWORLD')
    t.end()
  }))
})
