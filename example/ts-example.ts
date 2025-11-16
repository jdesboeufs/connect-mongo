import express, { Request, Response } from 'express'
import session from 'express-session'
import MongoStore from 'connect-mongo'
import { getMongoConfig } from './shared/mongo-config'

const app = express()
const port = 3000

declare module 'express-session' {
  interface SessionData {
    foo: string
  }
}

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

// Cast to any to sidestep slight @types/express-session vs @types/express version skew.
const sessionMiddleware = session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store
}) as any

app.use(sessionMiddleware);

app.get('/', (req: Request, res: Response) => {
  req.session.foo = 'test-id'
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})
