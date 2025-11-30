import test from 'ava'
import { SessionData } from 'express-session'
import { MongoClient } from 'mongodb'

import MongoStore, {
  createWebCryptoAdapter,
  createKrupteinAdapter,
  type CryptoAdapter,
} from './MongoStore.js'
import {
  createStoreHelper,
  makeData,
  makeDataNoCookie,
  makeCookie,
} from '../test/testHelper.js'

let { store, storePromise } = createStoreHelper()

test.before(async () => {
  await storePromise.clear().catch((err: unknown) => {
    if (err instanceof Error && err.message.match(/ns not found/)) {
      return null
    } else {
      throw err
    }
  })
})

test.afterEach.always(async () => {
  await storePromise.close()
})

test.serial('create store w/o provide required options', (t) => {
  t.throws(() => MongoStore.create({}), {
    message: /You must provide either mongoUrl\|clientPromise\|client/,
  })
})

test.serial(
  'create store with explicit undefined clientPromise still errors',
  (t) => {
    t.throws(
      () =>
        MongoStore.create({
          clientPromise: undefined as unknown as Promise<MongoClient>,
        }),
      { message: /You must provide either mongoUrl\|clientPromise\|client/ }
    )
  }
)

test.serial('create store with explicit undefined client still errors', (t) => {
  t.throws(
    () =>
      MongoStore.create({
        client: undefined as unknown as MongoClient,
      }),
    { message: /You must provide either mongoUrl\|clientPromise\|client/ }
  )
})

test.serial('create store with clientPromise', async (t) => {
  const clientP = MongoClient.connect('mongodb://root:example@127.0.0.1:27017')
  const store = MongoStore.create({ clientPromise: clientP })
  t.not(store, null)
  t.not(store, undefined)
  await store.collectionP
  store.close()
})

test.serial('create store with client', async (t) => {
  const client = await MongoClient.connect(
    'mongodb://root:example@127.0.0.1:27017'
  )
  const store = MongoStore.create({ client: client })
  t.not(store, null)
  t.not(store, undefined)
  await store.collectionP
  store.close()
})

test.serial('length should be 0', async (t) => {
  ;({ store, storePromise } = createStoreHelper())
  const length = await storePromise.length()
  t.is(length, 0)
})

test.serial('get non-exist session should throw error', async (t) => {
  ;({ store, storePromise } = createStoreHelper())
  const res = await storePromise.get('fake-sid')
  t.is(res, null)
})

test.serial('get all session should work for no session', async (t) => {
  ;({ store, storePromise } = createStoreHelper())
  const allSessions = await storePromise.all()
  t.deepEqual(allSessions, [])
})

test.serial('basic operation flow', async (t) => {
  ;({ store, storePromise } = createStoreHelper())
  let orgSession = makeData()
  const sid = 'test-basic-flow'
  const res = await storePromise.set(sid, orgSession)
  t.is(res, undefined)
  const session = await storePromise.get(sid)
  t.is(typeof session, 'object')
  orgSession = JSON.parse(JSON.stringify(orgSession))
  t.deepEqual(session, orgSession)
  const allSessions = await storePromise.all()
  t.deepEqual(allSessions, [orgSession])
  t.is(await storePromise.length(), 1)
  const err = await storePromise.destroy(sid)
  t.is(err, undefined)
  t.is(await storePromise.length(), 0)
})

test.serial('set and listen to event', async (t) => {
  ;({ store, storePromise } = createStoreHelper())
  const sid = 'test-set-event'
  const orgSession = makeData()
  const expectedSession = JSON.parse(JSON.stringify(orgSession))

  const waitForSet = new Promise<void>((resolve, reject) => {
    store.once('set', async (sessionId: string) => {
      try {
        t.is(sessionId, sid)
        const session = await storePromise.get(sid)
        t.truthy(session)
        t.is(typeof session, 'object')
        t.deepEqual(session, expectedSession)
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  })

  await storePromise.set(sid, orgSession)
  await waitForSet
})

test.serial('timestamps are disabled by default', async (t) => {
  ;({ store, storePromise } = createStoreHelper())
  const sid = 'timestamps-disabled'
  await storePromise.set(sid, makeData())
  const collection = await store.collectionP
  const sessionDoc = await collection.findOne({ _id: sid })

  t.truthy(sessionDoc)
  t.is(sessionDoc?.createdAt, undefined)
  t.is(sessionDoc?.updatedAt, undefined)
})

test.serial(
  'timestamps opt-in sets createdAt once and updates updatedAt',
  async (t) => {
    ;({ store, storePromise } = createStoreHelper({ timestamps: true }))
    const sid = 'timestamps-enabled'
    await storePromise.set(sid, makeData())
    const collection = await store.collectionP
    const first = await collection.findOne({ _id: sid })

    t.truthy(first?.createdAt)
    t.truthy(first?.updatedAt)
    const createdAtMs = first?.createdAt?.getTime()
    const updatedAtMs = first?.updatedAt?.getTime()
    t.truthy(createdAtMs)
    t.truthy(updatedAtMs)

    await new Promise((resolve) => setTimeout(resolve, 20))
    await storePromise.set(sid, { ...makeData(), fizz: 'buzz' } as SessionData)
    const second = await collection.findOne({ _id: sid })

    t.is(second?.createdAt?.getTime(), createdAtMs)
    t.truthy((second?.updatedAt?.getTime() ?? 0) > (updatedAtMs ?? 0))
  }
)

test.serial('set and listen to create event', async (t) => {
  ;({ store, storePromise } = createStoreHelper())
  const sid = 'test-create-event'
  const orgSession = makeData()

  const waitForCreate = new Promise<void>((resolve, reject) => {
    store.once('create', (sessionId: string) => {
      try {
        t.is(sessionId, sid)
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  })

  await storePromise.set(sid, orgSession)
  await waitForCreate
})

test.serial('set and listen to update event', async (t) => {
  ;({ store, storePromise } = createStoreHelper())
  const sid = 'test-update-event'
  const orgSession = makeData()

  await storePromise.set(sid, orgSession)

  const waitForUpdate = new Promise<void>((resolve, reject) => {
    store.once('update', (sessionId: string) => {
      try {
        t.is(sessionId, sid)
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  })

  await storePromise.set(sid, { ...orgSession, foo: 'new-bar' } as SessionData)
  await waitForUpdate
})

test.serial('set with no stringify', async (t) => {
  ;({ store, storePromise } = createStoreHelper({ stringify: false }))
  const orgSession = makeData()
  const cookie = orgSession.cookie
  const sid = 'test-no-stringify'
  const res = await storePromise.set(sid, orgSession)
  t.is(res, undefined)
  const session = await storePromise.get(sid)
  t.is(typeof session, 'object')
  t.deepEqual(orgSession.cookie, cookie)
  // @ts-ignore
  t.deepEqual(cookie.expires.toJSON(), session.cookie.expires.toJSON())
  // @ts-ignore
  t.deepEqual(cookie.secure, session.cookie.secure)
  const err = await storePromise.clear()
  t.is(err, undefined)
  t.is(await storePromise.length(), 0)
})

test.serial(
  'ttl uses cookie.maxAge before cookie.expires and ttl fallback',
  async (t) => {
    // Choose distinct magnitudes so ordering is unambiguous: 2s < 30s < 90s
    const defaultTtl = 30_000
    ;({ store, storePromise } = createStoreHelper({ ttl: defaultTtl / 1000 }))
    const cookieMaxAge = makeCookie()
    const sid = 'ttl-precedence'
    cookieMaxAge.maxAge = 2_000
    const sessionData = { foo: 'ttl', cookie: cookieMaxAge }

    // @ts-ignore
    await storePromise.set(sid, sessionData)
    const collection = await store.collectionP
    const doc = await collection.findOne({ _id: sid })

    // separate cookie with only expires set to test precedence
    const cookieExpires = makeCookie()
    cookieExpires.maxAge = undefined
    cookieExpires.expires = new Date(Date.now() + 90_000)
    const sid2 = 'ttl-precedence-expires'
    // @ts-ignore
    await storePromise.set(sid2, { foo: 'ttl2', cookie: cookieExpires })
    const doc2 = await collection.findOne({ _id: sid2 })

    // remove both to test ttl fallback
    const sid3 = 'ttl-precedence-ttl'
    // @ts-ignore
    await storePromise.set(sid3, { foo: 'ttl3' })
    const doc3 = await collection.findOne({ _id: sid3 })

    const expMs = doc?.expires?.getTime() ?? 0
    const expMs2 = doc2?.expires?.getTime() ?? 0
    const expMs3 = doc3?.expires?.getTime() ?? 0

    t.true(expMs > 0 && expMs2 > 0 && expMs3 > 0)
    // ordering: maxAge (2s) < ttl fallback (30s) < cookie.expires (90s)
    t.true(expMs < expMs3)
    t.true(expMs3 < expMs2)
  }
)

test.serial('clear preserves TTL index and is idempotent', async (t) => {
  ;({ store, storePromise } = createStoreHelper({ autoRemove: 'native' }))
  const collection = await store.collectionP
  await collection.insertOne({
    _id: 'clear-ttl-index',
    session: makeData(),
    expires: new Date(Date.now() + 1000),
  })
  const indexesBefore = await collection.listIndexes().toArray()
  t.true(indexesBefore.some((idx) => idx.name === 'expires_1'))

  await t.notThrowsAsync(() => storePromise.clear())

  const indexesAfter = await collection.listIndexes().toArray()
  t.true(indexesAfter.some((idx) => idx.name === 'expires_1'))

  await t.notThrowsAsync(() => storePromise.clear())
})

test.serial('decrypt failure only calls callback once', async (t) => {
  let secret = 'right-secret'
  const adapter: CryptoAdapter = {
    async encrypt(plaintext) {
      return `${secret}:${plaintext}`
    },
    async decrypt(ciphertext) {
      const prefix = `${secret}:`
      if (!ciphertext.startsWith(prefix)) {
        throw new Error('bad secret')
      }
      return ciphertext.slice(prefix.length)
    },
  }

  ;({ store, storePromise } = createStoreHelper({ cryptoAdapter: adapter }))
  const sid = 'decrypt-failure'
  await storePromise.set(sid, makeData())

  // Tamper with the secret so decryption fails
  secret = 'wrong-secret'

  await new Promise<void>((resolve) => {
    let calls = 0
    store.get(sid, (err, session) => {
      calls += 1
      t.truthy(err)
      t.is(session, undefined)
      t.is(calls, 1)
      resolve()
    })
  })
})

test.serial(
  'interval autoRemove suppresses rejections and clears timer on close',
  async (t) => {
    const originalSetInterval = global.setInterval
    const originalClearInterval = global.clearInterval
    const callbacks: (() => void)[] = []
    const fakeTimer = {
      ref() {
        return this
      },
      unref() {
        return this
      },
    } as unknown as NodeJS.Timeout
    let cleared = false
    ;(global as typeof globalThis).setInterval = ((fn: () => void) => {
      callbacks.push(fn)
      return fakeTimer
    }) as typeof setInterval
    ;(global as typeof globalThis).clearInterval = ((
      handle: NodeJS.Timeout
    ) => {
      if (handle === fakeTimer) {
        cleared = true
      }
    }) as typeof clearInterval

    const fakeCollection = {
      deleteMany: () => Promise.reject(new Error('interval failure')),
    }
    const fakeClient = {
      db: () => ({
        collection: () => fakeCollection,
      }),
      close: () => Promise.resolve(),
    }
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)

    let intervalStore: MongoStore | undefined
    try {
      intervalStore = MongoStore.create({
        clientPromise: Promise.resolve(fakeClient as unknown as MongoClient),
        autoRemove: 'interval',
        autoRemoveInterval: 1,
        collectionName: 'interval-test',
        dbName: 'interval-db',
      })
      await intervalStore.collectionP
      t.is(callbacks.length, 1)
      callbacks[0]?.()
      await new Promise((resolve) => setImmediate(resolve))
      t.is(unhandled.length, 0)
      await intervalStore.close()
      t.true(cleared)
      t.is(
        (intervalStore as unknown as { timer?: NodeJS.Timeout }).timer,
        undefined
      )
    } finally {
      process.off('unhandledRejection', onUnhandled)
      global.setInterval = originalSetInterval
      global.clearInterval = originalClearInterval
    }
  }
)

test.serial('test destroy event', async (t) => {
  ;({ store, storePromise } = createStoreHelper())
  const orgSession = makeData()
  const sid = 'test-destroy-event'

  const waitForDestroy = new Promise<void>((resolve, reject) => {
    store.once('destroy', (sessionId: string) => {
      try {
        t.is(sessionId, sid)
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  })

  await storePromise.set(sid, orgSession)
  await storePromise.destroy(sid)
  await waitForDestroy
})

test.serial('test set default TTL', async (t) => {
  const defaultTTL = 10
  ;({ store, storePromise } = createStoreHelper({
    ttl: defaultTTL,
  }))
  const orgSession = makeDataNoCookie()
  const sid = 'test-set-default-ttl'
  const timeBeforeSet = new Date().valueOf()
  // @ts-ignore
  await storePromise.set(sid, orgSession)
  const collection = await store.collectionP
  const session = await collection.findOne({ _id: sid })
  const timeAfterSet = new Date().valueOf()
  const expires = session?.expires?.valueOf()
  t.truthy(expires)
  if (expires) {
    t.truthy(timeBeforeSet + defaultTTL * 1000 <= expires)
    t.truthy(expires <= timeAfterSet + defaultTTL * 1000)
  }
})

test.serial('test default TTL', async (t) => {
  const defaultExpirationTime = 1000 * 60 * 60 * 24 * 14
  ;({ store, storePromise } = createStoreHelper())
  const orgSession = makeDataNoCookie()
  const sid = 'test-no-set-default-ttl'
  const timeBeforeSet = new Date().valueOf()
  // @ts-ignore
  await storePromise.set(sid, orgSession)
  const collection = await store.collectionP
  const session = await collection.findOne({ _id: sid })
  const timeAfterSet = new Date().valueOf()
  const expires = session?.expires?.valueOf()
  t.truthy(expires)
  if (expires) {
    t.truthy(timeBeforeSet + defaultExpirationTime <= expires)
    t.truthy(expires <= timeAfterSet + defaultExpirationTime)
  }
})

test.serial('test custom serializer', async (t) => {
  ;({ store, storePromise } = createStoreHelper({
    serialize: (obj: any) => {
      obj.ice = 'test-ice-serializer'
      return JSON.stringify(obj)
    },
  }))
  const orgSession = makeData()
  const sid = 'test-custom-serializer'
  await storePromise.set(sid, orgSession)
  const session = await storePromise.get(sid)
  t.is(typeof session, 'string')
  t.not(session, undefined)
  // @ts-ignore
  orgSession.ice = 'test-ice-serializer'
  // @ts-ignore
  t.is(session, JSON.stringify(orgSession))
})

test.serial('test custom deserializer', async (t) => {
  ;({ store, storePromise } = createStoreHelper({
    unserialize: (obj: any) => {
      const materialized =
        typeof obj === 'string'
          ? (JSON.parse(obj) as unknown as SessionData)
          : (obj as SessionData)
      ;(materialized as Record<string, unknown>).ice = 'test-ice-deserializer'
      return materialized
    },
  }))
  const orgSession = makeData()
  const sid = 'test-custom-deserializer'
  await storePromise.set(sid, orgSession)
  const session = await storePromise.get(sid)
  t.is(typeof session, 'object')
  // @ts-ignore
  orgSession.cookie = orgSession.cookie.toJSON()
  // @ts-ignore
  orgSession.ice = 'test-ice-deserializer'
  if (session && typeof session === 'object' && 'cookie' in session) {
    const cookie = (session as Record<string, any>).cookie
    if (cookie && typeof cookie === 'object') {
      // express-session 1.18 normalizes optional cookie props to null instead of leaving them undefined.
      // Mirror whatever shape we read back so the equality check stays resilient.
      if ('partitioned' in cookie) {
        // @ts-ignore Cookie typings don't expose partitioned yet.
        orgSession.cookie.partitioned = cookie.partitioned
      }
      if ('priority' in cookie) {
        // @ts-ignore Cookie typings don't expose priority yet.
        orgSession.cookie.priority = cookie.priority
      }
    }
  }
  t.not(session, undefined)
  t.deepEqual(session, orgSession)
})

test.serial('touch ops', async (t) => {
  ;({ store, storePromise } = createStoreHelper())
  const orgSession = makeDataNoCookie()
  const sid = 'test-touch'
  // @ts-ignore
  await storePromise.set(sid, orgSession)
  const collection = await store.collectionP
  const session = await collection.findOne({ _id: sid })
  await new Promise((resolve) => setTimeout(resolve, 500))
  t.not(session, undefined)
  await storePromise.touch(sid, session?.session as SessionData)
  const session2 = await collection.findOne({ _id: sid })
  t.not(session2, undefined)
  // Check if both expiry date are different
  t.truthy(session2?.expires?.getTime())
  t.truthy(session?.expires?.getTime())
  if (session?.expires?.getTime() && session2?.expires?.getTime()) {
    t.truthy(session2?.expires.getTime() > session?.expires.getTime())
  }
})

test.serial('touch updates updatedAt when timestamps enabled', async (t) => {
  ;({ store, storePromise } = createStoreHelper({ timestamps: true }))
  const orgSession = makeDataNoCookie()
  const sid = 'test-touch-timestamps'
  // @ts-ignore
  await storePromise.set(sid, orgSession)
  const collection = await store.collectionP
  const session = await collection.findOne({ _id: sid })
  const initialUpdatedAt = session?.updatedAt?.getTime()

  await new Promise((resolve) => setTimeout(resolve, 20))
  await storePromise.touch(sid, session?.session as SessionData)
  const touched = await collection.findOne({ _id: sid })
  const touchedUpdatedAt = touched?.updatedAt?.getTime()

  t.truthy(initialUpdatedAt)
  t.truthy(touchedUpdatedAt)
  if (initialUpdatedAt && touchedUpdatedAt) {
    t.true(touchedUpdatedAt > initialUpdatedAt)
  }
})

test.serial('touch ops with touchAfter', async (t) => {
  ;({ store, storePromise } = createStoreHelper({ touchAfter: 1 }))
  const orgSession = makeDataNoCookie()
  const sid = 'test-touch-with-touchAfter'
  // @ts-ignore
  await storePromise.set(sid, orgSession)
  const collection = await store.collectionP
  const session = await collection.findOne({ _id: sid })
  const lastModifiedBeforeTouch = session?.lastModified?.getTime()
  t.not(session, undefined)
  await storePromise.touch(sid, session as unknown as SessionData)
  const session2 = await collection.findOne({ _id: sid })
  t.not(session2, undefined)
  const lastModifiedAfterTouch = session2?.lastModified?.getTime()
  // Check if both expiry date are different
  t.is(lastModifiedBeforeTouch, lastModifiedAfterTouch)
})

test.serial('touch ops with touchAfter with touch', async (t) => {
  ;({ store, storePromise } = createStoreHelper({ touchAfter: 1 }))
  const orgSession = makeDataNoCookie()
  const sid = 'test-touch-with-touchAfter-should-touch'
  // @ts-ignore
  await storePromise.set(sid, orgSession)
  const collection = await store.collectionP
  const session = await collection.findOne({ _id: sid })
  const lastModifiedBeforeTouch = session?.lastModified?.getTime()
  await new Promise((resolve) => setTimeout(resolve, 1200))
  t.not(session, undefined)
  await storePromise.touch(sid, session as unknown as SessionData)
  const session2 = await collection.findOne({ _id: sid })
  t.not(session2, undefined)
  const lastModifiedAfterTouch = session2?.lastModified?.getTime()
  // Check if both expiry date are different
  t.truthy(lastModifiedAfterTouch)
  t.truthy(lastModifiedBeforeTouch)
  if (lastModifiedAfterTouch && lastModifiedBeforeTouch) {
    t.truthy(lastModifiedAfterTouch > lastModifiedBeforeTouch)
  }
})

test.serial(
  'touchAfter throttle keeps updatedAt unchanged until threshold when timestamps on',
  async (t) => {
    ;({ store, storePromise } = createStoreHelper({
      touchAfter: 1,
      timestamps: true,
    }))
    const sid = 'touchAfter-timestamps'
    // @ts-ignore
    await storePromise.set(sid, makeDataNoCookie())
    const collection = await store.collectionP
    const doc = await collection.findOne({ _id: sid })
    const initialUpdated = doc?.updatedAt?.getTime()

    const sessionWithMeta = await storePromise.get(sid)
    await storePromise.touch(sid, sessionWithMeta as SessionData)
    const docNoUpdate = await collection.findOne({ _id: sid })
    t.is(docNoUpdate?.updatedAt?.getTime(), initialUpdated)

    await new Promise((resolve) => setTimeout(resolve, 1100))
    const sessionWithMetaAfterWait = await storePromise.get(sid)
    await storePromise.touch(sid, sessionWithMetaAfterWait as SessionData)
    const docUpdated = await collection.findOne({ _id: sid })
    t.truthy((docUpdated?.updatedAt?.getTime() ?? 0) > (initialUpdated ?? 0))
  }
)

test.serial('cryptoAdapter conflicts with legacy crypto option', (t) => {
  const adapter: CryptoAdapter = {
    encrypt: async (payload) => payload,
    decrypt: async (payload) => payload,
  }
  t.throws(
    () =>
      MongoStore.create({
        mongoUrl: 'mongodb://root:example@127.0.0.1:27017',
        crypto: { secret: 'secret' },
        cryptoAdapter: adapter,
      }),
    { message: /legacy crypto option or cryptoAdapter/ }
  )
})

test.serial('custom cryptoAdapter roundtrips session data', async (t) => {
  const adapter: CryptoAdapter = {
    encrypt: async (payload) => `enc:${payload}`,
    decrypt: async (payload) => payload.replace(/^enc:/, ''),
  }
  ;({ store, storePromise } = createStoreHelper({
    cryptoAdapter: adapter,
    collectionName: 'custom-adapter',
  }))
  const sid = 'adapter-roundtrip'
  const original = makeData()
  await storePromise.set(sid, original)
  const session = await storePromise.get(sid)
  t.deepEqual(session, JSON.parse(JSON.stringify(original)))
})

test.serial(
  'kruptein adapter helper merges defaults and works with only secret',
  async (t) => {
    ;({ store, storePromise } = createStoreHelper({
      cryptoAdapter: createKrupteinAdapter({ secret: 'secret' }),
      collectionName: 'kruptein-adapter',
    }))
    const sid = 'kruptein-adapter'
    const original = makeData()
    await storePromise.set(sid, original)
    const session = await storePromise.get(sid)
    t.deepEqual(session, JSON.parse(JSON.stringify(original)))
  }
)

test.serial('web crypto adapter encrypts and decrypts sessions', async (t) => {
  const adapter = createWebCryptoAdapter({ secret: 'sup3r-secr3t' })
  ;({ store, storePromise } = createStoreHelper({
    cryptoAdapter: adapter,
    collectionName: 'webcrypto-adapter',
  }))
  const sid = 'webcrypto-session'
  const original = makeData()
  await storePromise.set(sid, original)
  const session = await storePromise.get(sid)
  t.deepEqual(session, JSON.parse(JSON.stringify(original)))
})

test.serial('web crypto adapter supports base64url encoding', async (t) => {
  const adapter = createWebCryptoAdapter({
    secret: 'sup3r-secr3t',
    encoding: 'base64url',
  })
  ;({ store, storePromise } = createStoreHelper({
    cryptoAdapter: adapter,
    collectionName: 'webcrypto-base64url',
  }))
  const sid = 'webcrypto-base64url'
  const original = makeData()
  await storePromise.set(sid, original)
  const session = await storePromise.get(sid)
  t.deepEqual(session, JSON.parse(JSON.stringify(original)))
})

test.serial('web crypto adapter supports hex encoding', async (t) => {
  const adapter = createWebCryptoAdapter({
    secret: 'sup3r-secr3t',
    encoding: 'hex',
  })
  ;({ store, storePromise } = createStoreHelper({
    cryptoAdapter: adapter,
    collectionName: 'webcrypto-hex',
  }))
  const sid = 'webcrypto-hex'
  const original = makeData()
  await storePromise.set(sid, original)
  const session = await storePromise.get(sid)
  t.deepEqual(session, JSON.parse(JSON.stringify(original)))
})

test.serial(
  'web crypto adapter derives key with PBKDF2 salt/iterations overrides',
  async (t) => {
    const adapter = createWebCryptoAdapter({
      secret: 'sup3r-secr3t',
      encoding: 'base64url',
      salt: 'custom-salt',
      iterations: 100_000,
    })
    ;({ store, storePromise } = createStoreHelper({
      cryptoAdapter: adapter,
      collectionName: 'webcrypto-pbkdf2',
    }))
    const sid = 'webcrypto-pbkdf2'
    const original = makeData()
    await storePromise.set(sid, original)
    const session = await storePromise.get(sid)
    t.deepEqual(session, JSON.parse(JSON.stringify(original)))
  }
)

test.serial('web crypto adapter supports AES-CBC algorithm', async (t) => {
  const adapter = createWebCryptoAdapter({
    secret: 'sup3r-secr3t',
    algorithm: 'AES-CBC',
    ivLength: 16,
  })
  ;({ store, storePromise } = createStoreHelper({
    cryptoAdapter: adapter,
    collectionName: 'webcrypto-aes-cbc',
  }))
  const sid = 'webcrypto-aes-cbc'
  const original = makeData()
  await storePromise.set(sid, original)
  const session = await storePromise.get(sid)
  t.deepEqual(session, JSON.parse(JSON.stringify(original)))
})

test.serial(
  'cryptoAdapter works with default stringify (string payload)',
  async (t) => {
    const adapter: CryptoAdapter = {
      encrypt: async (payload) => `enc:${payload}`,
      decrypt: async (payload) => payload.replace(/^enc:/, ''),
    }
    ;({ store, storePromise } = createStoreHelper({
      cryptoAdapter: adapter,
      collectionName: 'crypto-default-stringify',
    }))
    const sid = 'crypto-default-stringify'
    const original = makeData()
    await storePromise.set(sid, original)
    const session = await storePromise.get(sid)
    t.deepEqual(session, JSON.parse(JSON.stringify(original)))
  }
)

test.serial(
  'cryptoAdapter works with stringify=false (raw object path)',
  async (t) => {
    const adapter: CryptoAdapter = {
      encrypt: async (payload) => `enc:${payload}`,
      decrypt: async (payload) => payload.replace(/^enc:/, ''),
    }
    ;({ store, storePromise } = createStoreHelper({
      cryptoAdapter: adapter,
      stringify: false,
      collectionName: 'crypto-stringify-false',
    }))
    const sid = 'crypto-stringify-false'
    const original = makeDataNoCookie()
    // @ts-ignore
    await storePromise.set(sid, original)
    const session = await storePromise.get(sid)
    t.deepEqual(session, original)
  }
)

test.serial(
  'cryptoAdapter works with custom serialize/unserialize functions',
  async (t) => {
    const adapter: CryptoAdapter = {
      encrypt: async (payload) => `enc:${payload}`,
      decrypt: async (payload) => payload.replace(/^enc:/, ''),
    }
    const serialize = (session: SessionData) => ({
      ...session,
      marker: true,
    })
    const unserialize = (payload: unknown) => {
      /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
      const { marker, ...rest } = payload as Record<string, unknown>
      return rest as SessionData
    }

    ;({ store, storePromise } = createStoreHelper({
      cryptoAdapter: adapter,
      serialize,
      unserialize,
      collectionName: 'crypto-custom-serialize',
    }))
    const sid = 'crypto-custom-serialize'
    const original = makeData()
    await storePromise.set(sid, original)
    const session = await storePromise.get(sid)
    t.deepEqual(session, JSON.parse(JSON.stringify(original)))
  }
)

test.serial('basic operation flow with crypto', async (t) => {
  ;({ store, storePromise } = createStoreHelper({
    crypto: { secret: 'secret' },
    collectionName: 'crypto-test',
    autoRemove: 'disabled',
  }))
  let orgSession = makeData()
  const sid = 'test-basic-flow-with-crypto'
  const res = await storePromise.set(sid, orgSession)
  t.is(res, undefined)
  const session = await storePromise.get(sid)
  orgSession = JSON.parse(JSON.stringify(orgSession))
  t.deepEqual(session, orgSession)
  const sessions = await storePromise.all()
  t.not(sessions, undefined)
  t.not(sessions, null)
  t.is(sessions?.length, 1)
})

test.serial('crypto with stringify=false roundtrips raw objects', async (t) => {
  ;({ store, storePromise } = createStoreHelper({
    crypto: { secret: 'secret' },
    stringify: false,
    collectionName: 'crypto-no-stringify',
  }))
  const sid = 'crypto-no-stringify'
  const payload = makeDataNoCookie()
  // @ts-ignore
  await storePromise.set(sid, payload)
  const session = await storePromise.get(sid)
  t.deepEqual(session, payload)
})

test.serial(
  'transformId stores and retrieves using transformed key',
  async (t) => {
    const transformId = (sid: string) => `t-${sid}`
    ;({ store, storePromise } = createStoreHelper({ transformId }))
    const sid = 'transform-id'
    await storePromise.set(sid, makeData())
    const collection = await store.collectionP
    const doc = await collection.findOne({ _id: transformId(sid) })
    t.truthy(doc)
    const session = await storePromise.get(sid)
    t.truthy(session)
  }
)

test.serial('writeOperationOptions forwarded to updateOne', async (t) => {
  const calls: any[] = []
  const fakeCollection = {
    createIndex: () => Promise.resolve(),
    updateOne: (...args: any[]) => {
      calls.push(args)
      return Promise.resolve({ upsertedCount: 1 })
    },
  }
  const fakeClient = {
    db: () => ({ collection: () => fakeCollection }),
    close: () => Promise.resolve(),
  }

  const writeConcern = { w: 0 as const }
  const localStore = MongoStore.create({
    clientPromise: Promise.resolve(fakeClient as unknown as MongoClient),
    writeOperationOptions: writeConcern,
    collectionName: 'wopts',
    dbName: 'wopts-db',
  })
  await new Promise<void>((resolve, reject) =>
    localStore.set('wopts', makeData(), (err) =>
      err ? reject(err) : resolve()
    )
  )
  t.true(calls.length > 0)
  const opts = calls[0]?.[2]
  t.deepEqual(opts?.writeConcern, writeConcern)
  await localStore.close()
})

test.serial('custom serializer error surfaces from set()', async (t) => {
  const boom = new Error('serialize-fail')
  ;({ store, storePromise } = createStoreHelper({
    serialize: () => {
      throw boom
    },
  }))
  const sid = 'serializer-error'
  await t.throwsAsync(() => storePromise.set(sid, makeData()), {
    message: boom.message,
  })
})

test.serial('corrupted JSON payload bubbles error on get', async (t) => {
  ;({ store, storePromise } = createStoreHelper())
  const collection = await store.collectionP
  await collection.insertOne({
    _id: 'corrupt-json',
    session: '{bad json',
  })
  await t.throwsAsync(() => storePromise.get('corrupt-json'))
})

test.serial('with touch after and get non-exist session', async (t) => {
  ;({ store, storePromise } = createStoreHelper({
    touchAfter: 10,
  }))
  const sid = 'fake-sid-for-test-touch-after'
  const res = await storePromise.get(sid)
  t.is(res, null)
})
