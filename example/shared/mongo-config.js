require('./env')
const path = require('node:path')

const DEFAULT_DB_NAME = 'example-db'
const DEFAULT_URI = `mongodb://root:example@127.0.0.1:27017/${DEFAULT_DB_NAME}?authSource=admin`

const booleanTrue = new Set(['1', 'true', 'TRUE', 'yes'])

function getMongoConfig() {
  const dbName = process.env.MONGO_DB_NAME || DEFAULT_DB_NAME

  return {
    dbName,
    mongoUrl: process.env.MONGO_URL || DEFAULT_URI.replace(DEFAULT_DB_NAME, dbName),
    mongoOptions: buildMongoOptions(),
    sessionSecret: process.env.SESSION_SECRET || 'connect-mongo-example-secret',
    cryptoSecret: process.env.SESSION_CRYPTO_SECRET
  }
}

function buildMongoOptions() {
  const options = {}

  if (process.env.MONGO_MAX_POOL_SIZE) {
    const poolSize = Number(process.env.MONGO_MAX_POOL_SIZE)
    if (!Number.isNaN(poolSize) && poolSize > 0) {
      options.maxPoolSize = poolSize
    }
  }

  const tlsOptions = buildTlsOptions()
  return Object.keys(tlsOptions).length === 0 ? options : { ...options, ...tlsOptions }
}

function buildTlsOptions() {
  const options = {}
  const caFile = toAbsolute(process.env.MONGO_TLS_CA_FILE)

  if (!caFile) {
    return options
  }

  options.tls = true
  options.tlsCAFile = caFile

  const certKey = toAbsolute(process.env.MONGO_TLS_CERT_KEY_FILE)
  if (certKey) {
    options.tlsCertificateKeyFile = certKey
  }

  if (isTruthy(process.env.MONGO_TLS_ALLOW_INVALID_CERTIFICATES)) {
    options.tlsAllowInvalidCertificates = true
  }

  if (isTruthy(process.env.MONGO_TLS_ALLOW_INVALID_HOSTNAMES)) {
    options.tlsAllowInvalidHostnames = true
  }

  return options
}

function toAbsolute(maybePath) {
  if (!maybePath) {
    return undefined
  }

  return path.isAbsolute(maybePath) ? maybePath : path.resolve(process.cwd(), maybePath)
}

function isTruthy(value) {
  if (!value) {
    return false
  }

  return booleanTrue.has(value)
}

module.exports = {
  getMongoConfig
}
