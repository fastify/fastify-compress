'use strict'

const { createReadStream } = require('fs')
const { Socket } = require('net')
const { Duplex, PassThrough, Readable, Stream, Transform, Writable } = require('stream')
const { test } = require('tap')
const { isStream } = require('../lib/utils')

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
