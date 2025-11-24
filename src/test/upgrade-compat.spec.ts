import test, { type ExecutionContext } from 'ava'
import express from 'express'
import session from 'express-session'
import request from 'supertest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, symlinkSync } from 'node:fs'
import { MongoClient, Collection } from 'mongodb'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SESSION_SECRET = 'upgrade-session-secret'
const CRYPTO_SECRET = 'upgrade-crypto-secret'
const COOKIE_MAX_AGE_MS = 5 * 60 * 1000
const MONGO_URL =
  process.env.MONGO_URL ?? 'mongodb://root:example@127.0.0.1:27017'
const FIXTURE_TGZ = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'test-fixtures',
  'connect-mongo-5.1.0.tgz'
)
const PROJECT_NODE_MODULES = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'node_modules'
)

type StoreCtor = {
  create: (opts: any) => any
}

const getTTLIndex = async (collection: Collection) => {
  const indexes = await collection.listIndexes().toArray()
  return indexes.find((idx) => idx.name === 'expires_1')
}

const ensureFixturePresent = (t: ExecutionContext) => {
  if (!existsSync(FIXTURE_TGZ)) {
    t.fail(
      `Missing ${FIXTURE_TGZ}. Run "npm pack connect-mongo@5.1.0 --pack-destination test-fixtures --cache ./.npm-cache".`
    )
  }
}

const unpackOldPackage = () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'connect-mongo-5.1.0-'))
  // Node core lacks tar extraction; rely on the system tar available in dev envs.
  execFileSync('tar', ['-xzf', FIXTURE_TGZ, '-C', tmpDir])
  const packageRoot = join(tmpDir, 'package')
  const linkedNodeModules = join(packageRoot, 'node_modules')
  if (!existsSync(linkedNodeModules) && existsSync(PROJECT_NODE_MODULES)) {
    symlinkSync(PROJECT_NODE_MODULES, linkedNodeModules, 'dir')
  }
  return {
    packageRoot,
    cleanup: () => rmSync(tmpDir, { recursive: true, force: true }),
  }
}

const loadOldStore = (): { ctor: StoreCtor; cleanup: () => void } => {
  const { packageRoot, cleanup } = unpackOldPackage()
  const requireFromPkg = createRequire(join(packageRoot, 'package.json'))
  const mod = requireFromPkg(packageRoot)
  return { ctor: (mod?.default ?? mod) as StoreCtor, cleanup }
}

const buildApp = (Store: StoreCtor, storeOpts: Record<string, unknown>) => {
  const app = express()
  const store = Store.create({
    autoRemove: 'native',
    stringify: false,
    ...storeOpts,
  })
  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { maxAge: COOKIE_MAX_AGE_MS },
      store,
    })
  )
  app.get('/write', (req, res) => {
    req.session.views = (req.session.views ?? 0) + 1
    req.session.payload = { nested: 'value' }
    res.status(200).json({ views: req.session.views })
  })
  app.get('/touch', (req, res) => {
    req.session.views = (req.session.views ?? 0) + 1
    res.status(200).json({ views: req.session.views })
  })
  app.get('/ping', (req, res) => {
    res.status(200).json({ views: req.session?.views ?? null })
  })
  return { app, store }
}

const seedOldSession = async (
  t: ExecutionContext,
  collection: Collection,
  store: any,
  app: express.Express
) => {
  await (store.collectionP as Promise<Collection>)
  const firstRes = await request(app).get('/write').expect(200)
  const cookie = firstRes.headers['set-cookie']?.[0]
  t.truthy(cookie, 'old store should issue session cookie')
  const trimmedCookie = cookie?.split(';')[0] ?? ''
  const secondRes = await request(app)
    .get('/write')
    .set('Cookie', trimmedCookie)
    .expect(200)
  t.is(secondRes.body.views, 2)
  const ttlIndex = await getTTLIndex(collection)
  const doc = await collection.findOne({})
  return { cookie: trimmedCookie, ttlIndex, doc }
}

const runUpgradeScenario = async (t: ExecutionContext, crypto: boolean) => {
  ensureFixturePresent(t)
  const client = await MongoClient.connect(MONGO_URL).catch((err: unknown) => {
    t.log(`Mongo unavailable at ${MONGO_URL}: ${String(err)}`)
    return null
  })
  if (!client) return

  const dbName = `compat-upgrade-${crypto ? 'crypto' : 'plain'}-${Date.now()}`
  const collectionName = `sessions-${crypto ? 'crypto' : 'plain'}`
  const db = client.db(dbName)
  await db.dropDatabase().catch(() => undefined)
  const collection = db.collection(collectionName)

  const { ctor: OldStore, cleanup: cleanupPkg } = loadOldStore()
  let oldStore: any | undefined
  let newStore: any | undefined

  try {
    const { app: oldApp, store } = buildApp(OldStore, {
      mongoUrl: MONGO_URL,
      dbName,
      collectionName,
      touchAfter: 1,
      crypto: crypto ? { secret: CRYPTO_SECRET } : undefined,
    })
    oldStore = store
    const {
      cookie,
      ttlIndex: ttlBefore,
      doc: docBefore,
    } = await seedOldSession(t, collection, oldStore, oldApp)
    t.truthy(ttlBefore, 'TTL index should exist before upgrade')
    t.truthy(docBefore?.expires, 'session should have an expires value')

    await oldStore.close()

    const { app: newApp, store: upgradedStore } = buildApp(
      (await import('../lib/MongoStore.js')).default,
      {
        client,
        dbName,
        collectionName,
        touchAfter: 1,
        crypto: crypto ? { secret: CRYPTO_SECRET } : undefined,
      }
    )
    newStore = upgradedStore

    const ping = await request(newApp)
      .get('/ping')
      .set('Cookie', cookie)
      .expect(200)
    t.is(ping.body.views, 2, 'upgrade should read existing session')

    const touch = await request(newApp)
      .get('/touch')
      .set('Cookie', cookie)
      .expect(200)
    t.true(touch.body.views >= 3, 'upgrade should be able to update session')

    const docAfter = await collection.findOne({})
    t.truthy(docAfter?.expires)
    if (docAfter?.expires) {
      const delta = Math.abs(
        docAfter.expires.getTime() - (Date.now() + COOKIE_MAX_AGE_MS)
      )
      t.true(
        delta < 10_000,
        'expires should respect cookie.maxAge after upgrade'
      )
    }

    const ttlAfter = await getTTLIndex(collection)
    t.truthy(ttlAfter, 'TTL index should persist after upgrade')
    t.is(ttlBefore?.expireAfterSeconds, ttlAfter?.expireAfterSeconds)
    t.deepEqual(ttlBefore?.key, ttlAfter?.key)

    await newStore.close()
    await t.throwsAsync(async () => db.command({ ping: 1 }))
  } finally {
    if (newStore) {
      await newStore.close().catch(() => undefined)
    }
    if (oldStore) {
      await oldStore.close().catch(() => undefined)
    }
    await db.dropDatabase().catch(() => undefined)
    await client.close().catch(() => undefined)
    cleanupPkg()
  }
}

test.serial('upgrade from 5.1.0 preserves non-crypto sessions', async (t) => {
  await runUpgradeScenario(t, false)
})

test.serial('upgrade from 5.1.0 preserves crypto sessions', async (t) => {
  await runUpgradeScenario(t, true)
})
