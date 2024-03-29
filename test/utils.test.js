'use strict'

const { createReadStream } = require('node:fs')
const { Socket } = require('node:net')
const { Duplex, PassThrough, Readable, Stream, Transform, Writable } = require('node:stream')
const { test } = require('tap')
const { isStream, isDeflate, isGzip, intoAsyncIterator } = require('../lib/utils')

test('isStream() utility should be able to detect Streams', async (t) => {
  t.plan(12)

  t.equal(isStream(new Stream()), true)
  t.equal(isStream(new Readable()), true)
  t.equal(isStream(new Writable()), true)
  t.equal(isStream(new Duplex()), true)
  t.equal(isStream(new Transform()), true)
  t.equal(isStream(new PassThrough()), true)

  t.equal(isStream(createReadStream('package.json')), true)

  t.equal(isStream(new Socket()), true)

  t.equal(isStream({}), false)
  t.equal(isStream(null), false)
  t.equal(isStream(undefined), false)
  t.equal(isStream(''), false)
})

test('isDeflate() utility should be able to detect deflate compressed Buffer', async (t) => {
  t.plan(14)

  t.equal(isDeflate(Buffer.alloc(0)), false)
  t.equal(isDeflate(Buffer.alloc(0)), false)
  t.equal(isDeflate(Buffer.from([0x78])), false)
  t.equal(isDeflate(Buffer.from([0x78, 0x00])), false)
  t.equal(isDeflate(Buffer.from([0x7a, 0x01])), false)
  t.equal(isDeflate(Buffer.from([0x88, 0x01])), false)
  t.equal(isDeflate(Buffer.from([0x78, 0x11])), false)
  t.equal(isDeflate(Buffer.from([0x78, 0x01])), true)
  t.equal(isDeflate(Buffer.from([0x78, 0x9c])), true)
  t.equal(isDeflate(Buffer.from([0x78, 0xda])), true)

  t.equal(isDeflate({}), false)
  t.equal(isDeflate(null), false)
  t.equal(isDeflate(undefined), false)
  t.equal(isDeflate(''), false)
})

test('isGzip() utility should be able to detect gzip compressed Buffer', async (t) => {
  t.plan(10)

  t.equal(isGzip(Buffer.alloc(0)), false)
  t.equal(isGzip(Buffer.alloc(1)), false)
  t.equal(isGzip(Buffer.alloc(2)), false)
  t.equal(isGzip(Buffer.from([0x1f, 0x8b])), false)
  t.equal(isGzip(Buffer.from([0x1f, 0x8b, 0x00])), false)
  t.equal(isGzip(Buffer.from([0x1f, 0x8b, 0x08])), true)

  t.equal(isGzip({}), false)
  t.equal(isGzip(null), false)
  t.equal(isGzip(undefined), false)
  t.equal(isGzip(''), false)
})

test('intoAsyncIterator() utility should handle different data', async (t) => {
  t.plan(8)

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
    t.equal(buffer, buf)
  }

  for await (const string of intoAsyncIterator(str)) {
    t.equal(string, str)
  }

  for await (const chunk of intoAsyncIterator(arr)) {
    t.equal(chunk, str)
  }

  for await (const chunk of intoAsyncIterator(arrayBuffer)) {
    t.equal(chunk.toString(), Buffer.from(arrayBuffer).toString())
  }

  for await (const chunk of intoAsyncIterator(typedArray)) {
    t.equal(chunk.toString(), Buffer.from(typedArray).toString())
  }

  for await (const chunk of intoAsyncIterator(asyncIterator)) {
    t.equal(chunk, str)
  }

  for await (const chunk of intoAsyncIterator(obj)) {
    t.equal(chunk, obj)
  }
})
