'use strict'

const { createReadStream } = require('node:fs')
const { Socket } = require('node:net')
const { Duplex, PassThrough, Readable, Stream, Transform, Writable } = require('node:stream')
const { finished } = require('node:stream/promises')
const { test } = require('node:test')
const { availableParallelism } = require('node:os')
const { setImmediate: nextImmediate } = require('node:timers/promises')
const zlib = require('node:zlib')
const {
  computeSyncThreshold,
  isStream,
  isZstd,
  isDeflate,
  isGzip,
  intoAsyncIterator,
  createPeekTransform,
  hasNoTransformDirective
} = require('../lib/utils')

test('computeSyncThreshold() utility should scale the default with the host parallelism', async (t) => {
  t.plan(7)
  const equal = t.assert.equal

  // a single core has nothing to overlap stream compression with, so the whole range
  // is worth compressing synchronously
  equal(computeSyncThreshold(1), 65536)
  equal(computeSyncThreshold(2), 8192)
  // from three cores up the lower clamp takes over
  equal(computeSyncThreshold(3), 4096)
  equal(computeSyncThreshold(4), 4096)
  // beyond libuv's threadpool size extra cores cannot compress any more in parallel
  equal(computeSyncThreshold(8), 4096)
  equal(computeSyncThreshold(16), 4096)
  equal(computeSyncThreshold(1024), 4096)
})

test('computeSyncThreshold() utility should clamp the default to a sane range', async (t) => {
  const parallelisms = [0, 1, 2, 3, 4, 7, 12, 64, 4096]
  t.plan(parallelisms.length)

  for (const parallelism of parallelisms) {
    const threshold = computeSyncThreshold(parallelism)
    t.assert.ok(threshold >= 4096 && threshold <= 65536, `${parallelism} cores yielded ${threshold}`)
  }
})

test('computeSyncThreshold() utility should default to the host parallelism', async (t) => {
  t.plan(1)

  t.assert.equal(computeSyncThreshold(), computeSyncThreshold(availableParallelism()))
})

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

test('createPeekTransform', async (t) => {
  class UpperCaseTransform extends Transform {
    _transform (chunk, encoding, callback) {
      callback(null, chunk.toString().toUpperCase())
    }
  }

  await t.test('uppercase', async (t) => {
    t.plan(2)

    const transform = createPeekTransform(function (data) {
      t.assert.strictEqual(data.toString(), 'hello\nworl')
      return new UpperCaseTransform()
    })

    let data = ''
    transform.on('data', (chunk) => { data += chunk.toString() })
    transform.write('hello\n')
    transform.write('world\n')
    transform.end()

    await finished(transform)

    t.assert.strictEqual(data, 'HELLO\nWORLD\n')
  })

  await t.test('uppercase no newline', async (t) => {
    t.plan(2)

    const transform = createPeekTransform(function (data) {
      t.assert.strictEqual(data.toString(), 'helloworld')
      return new UpperCaseTransform()
    })

    let data = ''
    transform.on('data', (chunk) => { data += chunk.toString() })
    transform.write('hello')
    transform.write('world')
    transform.end()

    await finished(transform)

    t.assert.strictEqual(data, 'HELLOWORLD')
  })

  await t.test('error', async (t) => {
    t.plan(2)

    const transform = createPeekTransform(function (data) {
      throw new Error('boom')
    })

    transform.on('data', (chunk) => { t.assert.fail('should not reach') })
    transform.on('error', (error) => { t.assert.ok(error) })
    transform.write('hello')
    transform.write('world')
    transform.end()

    await t.assert.rejects(finished(transform), new Error('boom'))
  })

  await t.test('peekSize = 5', async (t) => {
    t.plan(2)

    const transform = createPeekTransform(function (data) {
      t.assert.strictEqual(data.toString(), 'hello')
      return new UpperCaseTransform()
    }, 5)

    let data = ''
    transform.on('data', (chunk) => { data += chunk.toString() })
    transform.write('hello\n')
    transform.write('world\n')
    transform.end()

    await finished(transform)

    t.assert.strictEqual(data, 'HELLO\nWORLD\n')
  })

  await t.test('data size < peekSize', async (t) => {
    t.plan(2)

    const transform = createPeekTransform(function (data) {
      t.assert.strictEqual(data.toString(), 'helloworld')
      return new UpperCaseTransform()
    }, 100)

    let data = ''
    transform.on('data', (chunk) => { data += chunk.toString() })
    transform.write('hello')
    transform.write('world')
    transform.end()

    await finished(transform)

    t.assert.strictEqual(data, 'HELLOWORLD')
  })

  await t.test('error when data size < peekSize', async (t) => {
    t.plan(2)

    const transform = createPeekTransform(function (data) {
      throw new Error('boom')
    }, 100)

    transform.on('data', (chunk) => { t.assert.fail('should not reach') })
    transform.on('error', (error) => { t.assert.ok(error) })
    transform.write('hello')
    transform.write('world')
    transform.end()

    await t.assert.rejects(finished(transform), new Error('boom'))
  })

  await t.test('destroy before the downstream is selected', async (t) => {
    t.plan(1)

    const transform = createPeekTransform(function () {
      t.assert.fail('should not reach')
    })

    transform.write('hello')
    transform.destroy()

    await t.assert.rejects(finished(transform), { code: 'ERR_STREAM_PREMATURE_CLOSE' })
  })

  await t.test('destroy tears the downstream down', async (t) => {
    t.plan(2)

    let downstream
    const transform = createPeekTransform(function () {
      downstream = new UpperCaseTransform()
      return downstream
    })

    transform.write('hello world')
    await nextImmediate()
    transform.destroy()

    await t.assert.rejects(finished(transform), { code: 'ERR_STREAM_PREMATURE_CLOSE' })
    t.assert.equal(downstream.destroyed, true)
  })

  await t.test('error inside downstream', async (t) => {
    t.plan(2)

    const transform = createPeekTransform(function (data) {
      return new Transform({
        transform (chunk, encoding, callback) {
          callback(new Error('boom'))
        }
      })
    })

    transform.on('data', (chunk) => { t.assert.fail('should not reach') })
    transform.on('error', (error) => { t.assert.ok(error) })
    transform.write('hello')
    transform.write('world')
    transform.end()

    await t.assert.rejects(finished(transform), new Error('boom'))
  })
})

test('createPeekTransform() should flush the downstream once per burst of writes', async (t) => {
  t.plan(4)

  const gzip = zlib.createGzip()
  const flushes = []
  const flush = gzip.flush
  gzip.flush = function (kind, callback) {
    flushes.push(kind)
    return flush.call(this, kind, callback)
  }
  const write = gzip.write
  const transform = createPeekTransform(() => gzip, 10, zlib.constants.Z_SYNC_FLUSH)

  const gunzip = zlib.createGunzip()
  let text = ''
  gunzip.on('data', (chunk) => { text += chunk })
  transform.pipe(gunzip)

  transform.write('hello ')
  transform.write('world')
  transform.write('!')
  await nextImmediate()
  await nextImmediate()
  t.assert.deepEqual(flushes, [zlib.constants.Z_SYNC_FLUSH])

  // the flush must not have scheduled another one on its own
  await nextImmediate()
  await nextImmediate()
  t.assert.deepEqual(flushes, [zlib.constants.Z_SYNC_FLUSH])

  // the downstream is written to, not patched
  t.assert.equal(gzip.write, write)

  transform.end()
  await finished(gunzip)
  t.assert.equal(text, 'hello world!')
})

test('createPeekTransform() should not flush ended or destroyed downstreams', async (t) => {
  t.plan(2)

  let flushes = 0
  function createTransform () {
    const downstream = new PassThrough()
    downstream.flush = () => { flushes++ }
    const transform = createPeekTransform(() => downstream, 1, 0)
    transform.resume()
    return transform
  }

  const ended = createTransform()
  ended.write('hello')
  ended.end()

  const destroyed = createTransform()
  destroyed.write('hello')
  await nextImmediate()
  destroyed.write('world')
  destroyed.destroy()

  await nextImmediate()
  await nextImmediate()
  t.assert.equal(flushes, 1)

  // a transform that is left alone does get flushed
  const idle = createTransform()
  idle.write('hello')
  await nextImmediate()
  await nextImmediate()
  t.assert.equal(flushes, 2)
  idle.destroy()
})

test('createPeekTransform() should not flush without a flush kind or a `flush()` method', async (t) => {
  t.plan(1)

  let flushes = 0
  const withFlush = new PassThrough()
  withFlush.flush = () => { flushes++ }
  const withoutKind = createPeekTransform(() => withFlush, 1)
  withoutKind.resume()
  withoutKind.write('hello')

  const withoutFlush = createPeekTransform(() => new PassThrough(), 1, 0)
  withoutFlush.resume()
  withoutFlush.write('hello')

  await nextImmediate()
  await nextImmediate()
  t.assert.equal(flushes, 0)
  withoutKind.destroy()
  withoutFlush.destroy()
})

test('hasNoTransformDirective() utility should match the `no-transform` directive only', async (t) => {
  const cases = [
    [undefined, false],
    ['', false],
    ['max-age=60', false],
    ['no-transform', true],
    ['NO-TRANSFORM', true],
    [' public ,  no-transform ', true],
    ['public, max-age=60, no-transform', true],
    ['no-transform, public', true],
    [['public', 'no-transform'], true],
    [['public', 'max-age=60'], false],
    ['x-no-transform', false],
    ['no-transforms', false],
    ['no-transform-later', false],
    ['no-transform=1', true],
    ['private="no-transform"', false],
    ['private="a, no-transform", max-age=60', false],
    ['private="a\\", no-transform"', false],
    ['private="a\\"b", no-transform', true],
    ['private="unterminated, no-transform', false]
  ]
  t.plan(cases.length)

  for (const [value, expected] of cases) {
    t.assert.equal(hasNoTransformDirective(value), expected, JSON.stringify(value))
  }
})
