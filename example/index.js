const express = require('express')
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

const store = MongoStore.create({
  mongoUrl,
  dbName,
  mongoOptions,
  stringify: false,
  ...(cryptoSecret ? { crypto: { secret: cryptoSecret } } : {})
})

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store
}));

app.get('/', (req, res) => {
  req.session.foo = 'test-id'
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})
