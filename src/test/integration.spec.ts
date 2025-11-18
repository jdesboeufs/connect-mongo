import test from 'ava'
import request from 'supertest'
import express from 'express'
import session, { SessionOptions } from 'express-session'
import MongoStore from '../lib/MongoStore.js'
import { ConnectMongoOptions } from '../lib/MongoStore.js'

declare module 'express-session' {
  interface SessionData {
    [key: string]: any
  }
}

type AgentWithCleanup = {
  agent: ReturnType<typeof request.agent>
  cleanup: () => Promise<void>
}

function createSupertestAgent(
  sessionOpts: SessionOptions,
  mongoStoreOpts: ConnectMongoOptions
): AgentWithCleanup {
  const app = express()
  const store = MongoStore.create(mongoStoreOpts)
  app.use(
    session({
      ...sessionOpts,
      store: store,
    })
  )
  app.get('/', function (req, res) {
    if (typeof req.session.views === 'number') {
      req.session.views++
    } else {
      req.session.views = 0
    }
    res.status(200).send({ views: req.session.views })
  })
  app.get('/ping', function (req, res) {
    res.status(200).send({ views: req.session.views })
  })
  const agent = request.agent(app)
  return {
    agent,
    cleanup: async () => {
      await store.close()
    },
  }
}

function createSupertestAgentWithDefault(
  sessionOpts: Omit<SessionOptions, 'secret'> = {},
  mongoStoreOpts: ConnectMongoOptions = {}
) {
  return createSupertestAgent(
    { secret: 'foo', ...sessionOpts },
    {
      mongoUrl: 'mongodb://root:example@127.0.0.1:27017',
      dbName: 'itegration-test-db',
      stringify: false,
      ...mongoStoreOpts,
    }
  )
}

test.serial('simple case', async (t) => {
  const { agent, cleanup } = createSupertestAgentWithDefault()
  try {
    await agent.get('/').expect(200)
    const res = await agent.get('/').expect(200)
    t.deepEqual(res.body, { views: 1 })
  } finally {
    await cleanup()
  }
})

test.serial('simple case with touch after', async (t) => {
  const { agent, cleanup } = createSupertestAgentWithDefault(
    { resave: false, saveUninitialized: false, rolling: true },
    { touchAfter: 1 }
  )

  try {
    await agent.get('/').expect(200)
    const res = await agent.get('/').expect(200)
    t.deepEqual(res.body, { views: 1 })
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const pingRes = await agent.get('/ping').expect(200)
    t.deepEqual(pingRes.body, { views: 1 })
  } finally {
    await cleanup()
  }
})
