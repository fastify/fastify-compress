const fs = require('fs')
const mimedb = require('../node_modules/mime-db/db.json')
const compresibles = Object.entries(mimedb).filter(([k, v]) => v.compressible).map(([k, v]) => k)

fs.writeFileSync('./lib/compresibles.js', `module.exports = ${JSON.stringify(compresibles, null, 2)}`)
