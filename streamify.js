'use strict'
const { Readable } = require('readable-stream')

module.exports = data => (
  new Readable({
    read () {
      this.push(data)
      this.push(null)
    }
  })
)
