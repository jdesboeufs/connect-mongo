const express = require('express')
const mongoose = require('mongoose')
const session = require('express-session')
const MongoStore = require('connect-mongo').default

// App Init
const app = express()
const port = 3000

// Starting Server
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})

// Mongoose Connection
const appDBConnection = mongoose
  .createConnection(process.env.APP_DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then((connection) => {
    console.log('Connected to AppDB.')
    return connection
  })

const sessionDBConnection = mongoose
  .createConnection(process.env.SESSIONS_DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then((connection) => {
    console.log('Connected to SessionsDB.')
    return connection
  })

// Session Init
const sessionInit = (clientPromise) => {
  app.use(
    session({
      store: MongoStore.create({
        clientPromise,
        mongoOptions: {
          useNewUrlParser: true,
          useUnifiedTopology: true,
        },
      }),
      secret: 'hello',
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 24 * 60 * 60 * 1000 },
    })
  )
}

// Router Init
const router = express.Router()

router.get('', (req, res) => {
  req.session.foo = 'bar'
  res.send('Session Updated')
})

const setupApp = async () => {
  const connection = await sessionDBConnection
  const mongoClient = connection.getClient()
  const clientPromise = Promise.resolve(mongoClient)
  // Session Init
  sessionInit(clientPromise)
  // Routes Init
  app.use('/', router)
}
setupApp()
