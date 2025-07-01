'use strict'

const { createReadStream } = require('node:fs')
const { Socket } = require('node:net')
const { Duplex, PassThrough, Readable, Stream, Transform, Writable } = require('node:stream')
const { test } = require('node:test')
const { isStream, isZstd, isDeflate, isGzip, intoAsyncIterator } = require('../lib/utils')

test('isStream() utility should be able to detect Streams', async (t) => {
  t.plan(12)
  const equal = t.assert.equal

  equal(isStream(new Stream()), true)
  equal(isStream(new Readable()), true)
  equal(isStream(new Writable()), true)
  equal(isStream(new Duplex()), true)
  equal(isStream(new Transform()), true)
  equal(isStream(new PassThrough()), true)

  equal(isStream(createReadStream('package.json')), true)

  equal(isStream(new Socket()), true)

  equal(isStream({}), false)
  equal(isStream(null), false)
  equal(isStream(undefined), false)
  equal(isStream(''), false)
})

test('isDeflate() utility should be able to detect deflate compressed Buffer', async (t) => {
  t.plan(14)
  const equal = t.assert.equal

  equal(isDeflate(Buffer.alloc(0)), false)
  equal(isDeflate(Buffer.alloc(0)), false)
  equal(isDeflate(Buffer.from([0x78])), false)
  equal(isDeflate(Buffer.from([0x78, 0x00])), false)
  equal(isDeflate(Buffer.from([0x7a, 0x01])), false)
  equal(isDeflate(Buffer.from([0x88, 0x01])), false)
  equal(isDeflate(Buffer.from([0x78, 0x11])), false)
  equal(isDeflate(Buffer.from([0x78, 0x01])), true)
  equal(isDeflate(Buffer.from([0x78, 0x9c])), true)
  equal(isDeflate(Buffer.from([0x78, 0xda])), true)

  equal(isDeflate({}), false)
  equal(isDeflate(null), false)
  equal(isDeflate(undefined), false)
  equal(isDeflate(''), false)
})

test('isZstd() utility should be able to detect zstd compressed Buffer', async (t) => {
  t.plan(10)
  const equal = t.assert.equal

  equal(isZstd(Buffer.alloc(0)), false)
  equal(isZstd(Buffer.alloc(1)), false)
  equal(isZstd(Buffer.alloc(2)), false)
  equal(isZstd(Buffer.alloc(3)), false)
  equal(isZstd(Buffer.from([0x28, 0xb5, 0x2f])), false)
  equal(isZstd(Buffer.from([0x28, 0xb5, 0x2f, 0xfd])), true)

  equal(isZstd({}), false)
  equal(isZstd(null), false)
  equal(isZstd(undefined), false)
  equal(isZstd(''), false)
})

test('isGzip() utility should be able to detect gzip compressed Buffer', async (t) => {
  t.plan(10)
  const equal = t.assert.equal

  equal(isGzip(Buffer.alloc(0)), false)
  equal(isGzip(Buffer.alloc(1)), false)
  equal(isGzip(Buffer.alloc(2)), false)
  equal(isGzip(Buffer.from([0x1f, 0x8b])), false)
  equal(isGzip(Buffer.from([0x1f, 0x8b, 0x00])), false)
  equal(isGzip(Buffer.from([0x1f, 0x8b, 0x08])), true)

  equal(isGzip({}), false)
  equal(isGzip(null), false)
  equal(isGzip(undefined), false)
  equal(isGzip(''), false)
})

test('intoAsyncIterator() utility should handle different data', async (t) => {
  t.plan(8)
  const equal = t.assert.equal

  const buf = Buffer.from('foo')
  const str = 'foo'
  const arr = [str, str]
  const arrayBuffer = new ArrayBuffer(8)
  const typedArray = new Int32Array(arrayBuffer)
  const asyncIterator = (async function * () {
    yield str
  })()
  const obj = {}

  for await (const buffer of intoAsyncIterator(buf)) {
    equal(buffer, buf)
  }

  for await (const string of intoAsyncIterator(str)) {
    equal(string, str)
  }

  for await (const chunk of intoAsyncIterator(arr)) {
    equal(chunk, str)
  }

  for await (const chunk of intoAsyncIterator(arrayBuffer)) {
    equal(chunk.toString(), Buffer.from(arrayBuffer).toString())
  }

  for await (const chunk of intoAsyncIterator(typedArray)) {
    equal(chunk.toString(), Buffer.from(typedArray).toString())
  }

  for await (const chunk of intoAsyncIterator(asyncIterator)) {
    equal(chunk, str)
  }

  for await (const chunk of intoAsyncIterator(obj)) {
    equal(chunk, obj)
  }
})
