const express = require('express')
const mongoose = require('mongoose')
const session = require('express-session')
const MongoStore = require('connect-mongo')
const { getMongoConfig } = require('./shared/mongo-config')

const app = express()
const port = 3000

const {
  mongoUrl,
  mongoOptions,
  dbName,
  sessionSecret,
  cryptoSecret
} = getMongoConfig()

const appDbUrl = process.env.APP_MONGO_URL || mongoUrl
const appDbName = process.env.APP_DB_NAME || `${dbName}-app`

const appConnection = mongoose.createConnection(appDbUrl, {
  dbName: appDbName,
  ...mongoOptions
})

const sessionConnection = mongoose.createConnection(mongoUrl, {
  dbName,
  ...mongoOptions
})

const sessionInit = (client) => {
  app.use(
    session({
      store: MongoStore.create({
        client,
        dbName,
        mongoOptions,
        ...(cryptoSecret ? { crypto: { secret: cryptoSecret } } : {})
      }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 24 * 60 * 60 * 1000 }
    })
  )
}

async function bootstrap() {
  await Promise.all([appConnection.asPromise(), sessionConnection.asPromise()])
  console.log('Connected to AppDB and SessionsDB.')
  const mongoClient = sessionConnection.getClient()
  sessionInit(mongoClient)

  const router = express.Router()
  router.get('/', (req, res) => {
    req.session.foo = 'bar'
    res.send('Session Updated')
  })

  app.use('/', router)

  app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
  })
}

bootstrap().catch((err) => {
  console.error('Unable to initialize Mongo connections', err)
  process.exitCode = 1
})
