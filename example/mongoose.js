const express = require('express')
const session = require('express-session')
const MongoStore = require('connect-mongo')
const mongoose = require('mongoose')
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

const clientPromise = mongoose.connect(
  mongoUrl,
  {
    dbName,
    ...mongoOptions
  }
).then((connection) => connection.connection.getClient())

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    clientPromise,
    dbName,
    stringify: false,
    autoRemove: 'interval',
    autoRemoveInterval: 1,
    ...(cryptoSecret ? { crypto: { secret: cryptoSecret } } : {})
  })
}));

app.get('/', (req, res) => {
  req.session.foo = 'test-id'
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})
