'use strict'

const { createReadStream } = require('fs')
const { Socket } = require('net')
const { Duplex, PassThrough, Readable, Stream, Transform, Writable } = require('stream')
const { test } = require('tap')
const { isStream, isDeflate, isGzip } = require('../lib/utils')

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
