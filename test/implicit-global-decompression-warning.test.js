'use strict'

// Kept in its own file: `node --test` runs each test file in its own process,
// so the module-level dedupe guard on the warning (it is only ever emitted once
// per process) cannot be tripped early by any of the many `fastify.register(compressPlugin)`
// calls with no options elsewhere in the suite.

const { test, describe } = require('node:test')
const Fastify = require('fastify')
const compressPlugin = require('../index')

describe('It should warn when globalDecompression is left at its implicit default :', async () => {
  // The negative cases run before the positive one for the same reason this file is
  // isolated from the rest of the suite: once the warning fires, the module-level guard
  // prevents it from firing again for the remainder of the process.
  test('does not emit when `globalDecompression` is set explicitly', async (t) => {
    function inspect (warning) {
      if (warning.code === 'FST_CP_WARN_IMPLICIT_GLOBAL_DECOMPRESSION') {
        t.assert.fail('warning should not have been emitted')
      }
    }
    process.on('warning', inspect)
    t.after(() => process.off('warning', inspect))

    const fastify = Fastify()
    await fastify.register(compressPlugin, { globalDecompression: false })
    await fastify.ready()
  })

  test('does not emit when `global` is set explicitly', async (t) => {
    function inspect (warning) {
      if (warning.code === 'FST_CP_WARN_IMPLICIT_GLOBAL_DECOMPRESSION') {
        t.assert.fail('warning should not have been emitted')
      }
    }
    process.on('warning', inspect)
    t.after(() => process.off('warning', inspect))

    const fastify = Fastify()
    await fastify.register(compressPlugin, { global: false })
    await fastify.ready()
  })

  test('emits FST_CP_WARN_IMPLICIT_GLOBAL_DECOMPRESSION when neither `globalDecompression` nor `global` is set', async (t) => {
    function inspect (warning) {
      t.assert.strictEqual(warning.code, 'FST_CP_WARN_IMPLICIT_GLOBAL_DECOMPRESSION')
      t.assert.strictEqual(warning.name, 'DeprecationWarning')
    }
    t.plan(2)
    process.on('warning', inspect)
    t.after(() => process.off('warning', inspect))

    const fastify = Fastify()
    await fastify.register(compressPlugin)
    await fastify.ready()
  })
})
