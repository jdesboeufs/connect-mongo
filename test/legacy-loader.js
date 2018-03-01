'use strict'

const legacyTests = require('./legacy-tests')

// Catch-all for unhandled promise rejections
process.on('unhandledRejection', (reason, err) => {
  console.error('Caught unhandled rejection!')
  console.error(`Reason: ${reason}`)
  console.error(err)
  process.exit(1)
})

describe('Legacy tests', function () {
  this.timeout(6000)
  Object.keys(legacyTests).forEach(testName => {
    it(testName, legacyTests[testName])
  })
})
