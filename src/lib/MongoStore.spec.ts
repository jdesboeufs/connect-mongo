import test from 'ava'
import { SessionData } from 'express-session'

import {
  createStoreHelper,
  makeData,
  makeDataNoCookie,
} from '../test/testHelper'

let { store, storePromise } = createStoreHelper()

test.before(async () => {
  await storePromise.clear().catch((err) => {
    if (err.message.match(/ns not found/)) {
      return null
    } else {
      throw err
    }
  })
})

test.afterEach.always(async () => {
  await storePromise.close()
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

test.serial.cb('set and listen to event', (t) => {
  ;({ store, storePromise } = createStoreHelper())
  let orgSession = makeData()
  const sid = 'test-set-event'
  store.set(sid, orgSession)
  orgSession = JSON.parse(JSON.stringify(orgSession))
  store.on('set', (sessionId) => {
    t.is(sessionId, sid)
    store.get(sid, (err, session) => {
      t.is(err, null)
      t.is(typeof session, 'object')
      t.deepEqual(session, orgSession)
      t.end()
    })
  })
})

test.serial.cb('set and listen to create event', (t) => {
  ;({ store, storePromise } = createStoreHelper())
  const orgSession = makeData()
  const sid = 'test-create-event'
  store.set(sid, orgSession)
  store.on('create', (sessionId) => {
    t.is(sessionId, sid)
    t.end()
  })
})

test.serial.cb('set and listen to update event', (t) => {
  ;({ store, storePromise } = createStoreHelper())
  const orgSession = makeData()
  const sid = 'test-update-event'
  store.set(sid, orgSession)
  store.set(sid, { ...orgSession, foo: 'new-bar' } as SessionData)
  store.on('update', (sessionId) => {
    t.is(sessionId, sid)
    t.end()
  })
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

test.serial.cb('test destory event', (t) => {
  ;({ store, storePromise } = createStoreHelper())
  const orgSession = makeData()
  const sid = 'test-destory-event'
  store.on('destroy', (sessionId) => {
    t.is(sessionId, sid)
    t.end()
  })
  storePromise.set(sid, orgSession).then(() => {
    store.destroy(sid)
  })
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
  t.truthy(timeBeforeSet + defaultTTL * 1000 <= session?.expires.valueOf())
  t.truthy(session?.expires.valueOf() <= timeAfterSet + defaultTTL * 1000)
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
  t.truthy(timeBeforeSet + defaultExpirationTime <= session?.expires.valueOf())
  t.truthy(session?.expires.valueOf() <= timeAfterSet + defaultExpirationTime)
})

test.serial('test custom serializer', async (t) => {
  ;({ store, storePromise } = createStoreHelper({
    serialize: (obj) => {
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
    unserialize: (obj) => {
      obj.ice = 'test-ice-deserializer'
      return obj
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
  await storePromise.touch(sid, session.session)
  const session2 = await collection.findOne({ _id: sid })
  // Check if both expiry date are different
  t.truthy(session2.expires.getTime() > session.expires.getTime())
})

test.serial('touch ops with touchAfter', async (t) => {
  ;({ store, storePromise } = createStoreHelper({ touchAfter: 1 }))
  const orgSession = makeDataNoCookie()
  const sid = 'test-touch-with-touchAfter'
  // @ts-ignore
  await storePromise.set(sid, orgSession)
  const collection = await store.collectionP
  const session = await collection.findOne({ _id: sid })
  const lastModifiedBeforeTouch = session.lastModified.getTime()
  await storePromise.touch(sid, session)
  const session2 = await collection.findOne({ _id: sid })
  const lastModifiedAfterTouch = session2.lastModified.getTime()
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
  const lastModifiedBeforeTouch = session.lastModified.getTime()
  await new Promise((resolve) => setTimeout(resolve, 1200))
  await storePromise.touch(sid, session)
  const session2 = await collection.findOne({ _id: sid })
  const lastModifiedAfterTouch = session2.lastModified.getTime()
  // Check if both expiry date are different
  t.truthy(lastModifiedAfterTouch > lastModifiedBeforeTouch)
})

test.serial('basic operation flow with crypto', async (t) => {
  ;({ store, storePromise } = createStoreHelper({
    crypto: { secret: 'secret' },
  }))
  let orgSession = makeData()
  const sid = 'test-basic-flow-with-crypto'
  const res = await storePromise.set(sid, orgSession)
  t.is(res, undefined)
  const session = await storePromise.get(sid)
  orgSession = JSON.parse(JSON.stringify(orgSession))
  // @ts-ignore
  t.deepEqual(session, orgSession)
})

test.serial('with touch after and get non-exist session', async (t) => {
  ;({ store, storePromise } = createStoreHelper({
    touchAfter: 10,
  }))
  const sid = 'fake-sid-for-test-touch-after'
  const res = await storePromise.get(sid)
  t.is(res, null)
})
