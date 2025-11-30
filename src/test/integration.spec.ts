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
  store: MongoStore
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
    store,
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
      dbName: 'integration-test-db',
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

test.serial(
  'timestamps option adds createdAt/updatedAt in integration flow',
  async (t) => {
    const { agent, cleanup, store } = createSupertestAgentWithDefault(
      { resave: false, saveUninitialized: false, rolling: true },
      { timestamps: true, collectionName: 'integration-timestamps' }
    )

    try {
      await agent.get('/').expect(200)
      const collection = await store.collectionP
      const doc = await collection.findOne({})
      t.truthy(doc?.createdAt)
      t.truthy(doc?.updatedAt)

      const firstUpdated = doc?.updatedAt?.getTime()
      await new Promise((resolve) => setTimeout(resolve, 20))
      await agent.get('/ping').expect(200)
      const doc2 = await collection.findOne({ _id: doc?._id })
      t.truthy((doc2?.updatedAt?.getTime() ?? 0) >= (firstUpdated ?? 0))
    } finally {
      await cleanup()
    }
  }
)
