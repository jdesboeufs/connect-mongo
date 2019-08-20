'use strict'

function mergeMongoOptions(mongoOptions) {
  const DEFAULT_OPTS = { useNewUrlParser: true, useUnifiedTopology: true }
  return Object.assign(DEFAULT_OPTS, mongoOptions)
}

module.exports = {
  mergeMongoOptions,
}
