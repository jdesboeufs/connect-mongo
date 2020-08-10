'use strict'

const expressSession = require('express-session')
const MongoStore = require('..')(expressSession)

const connectionString =
  process.env.MONGODB_URL || 'mongodb://localhost:27017/connect-mongo-test'

const mongo = require('mongodb')
const mongoose = require('mongoose')

// Create a connect cookie instance
const makeCookie = function () {
  const cookie = new expressSession.Cookie()
  cookie.maxAge = 10000 // This sets cookie.expire through a setter
  cookie.secure = true
  cookie.domain = 'cow.com'
  cookie.sameSite = false

  return cookie
}

function getMongooseConnection() {
  return mongoose.createConnection(connectionString, { useNewUrlParser: true })
}

function getClientPromise() {
  return new Promise((resolve, reject) => {
    mongo.MongoClient.connect(
      connectionString,
      { useNewUrlParser: true },
      (err, client) => {
        if (err) {
          reject(err)
        } else {
          resolve(client)
        }
      }
    )
  })
}

// Create session data
const makeData = function () {
  return {
    foo: 'bar',
    baz: {
      cow: 'moo',
      chicken: 'cluck',
    },
    num: 1,
    cookie: makeCookie(),
  }
}

const makeDataNoCookie = function () {
  return {
    foo: 'bar',
    baz: {
      cow: 'moo',
      fish: 'blub',
      fox: 'nobody knows!',
    },
    num: 2,
  }
}

// Given a session id, input data, and session, make sure the stored data matches in the input data
const assertSessionEquals = function (sid, data, session) {
  if (typeof session.session === 'string') {
    // Compare stringified JSON
    expect(session.session).toBe(JSON.stringify(data))
  } else {
    // Can't do a deepEqual for the whole session as we need the toJSON() version of the cookie
    // Make sure the session data in intact
    for (const prop in session.session) {
      if (prop === 'cookie') {
        // Make sure the cookie is intact
        expect(session.session.cookie).toEqual(data.cookie.toJSON())
      } else {
        expect(session.session[prop]).toEqual(data[prop])
      }
    }
  }

  // Make sure the ID matches
  expect(session._id).toEqual(sid)
}

const openDb = function (options, callback) {
  const store = new MongoStore(options)
  store.once('connected', function () {
    callback(this, this.db, this.collection)
  })
}

async function cleanup(store, collection, callback) {
  await collection.drop()
  await store.close()
  callback()
}

function getNativeDbConnection(options, done) {
  if (!done) {
    done = options
    options = {}
  }
  mongo.MongoClient.connect(
    connectionString,
    { useNewUrlParser: true },
    (err, client) => {
      if (err) {
        return done(err)
      }
      openDb(Object.assign(options, { client }), done)
    }
  )
}

describe('legacy tests', () => {
  test('test_set', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_set-sid'
        const data = makeData()

        store.set(sid, data, (err) => {
          expect(err).toBeNull()
          collection.findOne({ _id: sid }, (err, session) => {
            expect(err).toBeNull()
            assertSessionEquals(sid, data, session)
            cleanup(store, collection, resolve)
          })
        })
      })
    })
  })

  test('test_set_promise', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_set_promise-sid'
        const data = makeData()
        await store.set(sid, data)
        // Verify it was saved
        const session = await collection.findOne({ _id: sid })
        expect(session).not.toBe(null)
        assertSessionEquals(sid, data, session)
        cleanup(store, collection, resolve)
      })
    })
  })

  test('test_set_event', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_set_promise-sid'
        const data = makeData()
        store.on('set', async (sessionId) => {
          // Verify it was saved
          const session = await collection.findOne({ _id: sid })
          expect(session).not.toBe(null)
          assertSessionEquals(sid, data, session)
          cleanup(store, collection, resolve)
        })
        store.set(sid, data)
      })
    })
  })

  test('test_set_no_stringify', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(
        { stringify: false },
        async (store, db, collection) => {
          const sid = 'test_set-sid'
          const data = makeData()
          await store.set(sid, data)
          // Verify it was saved
          const session = await collection.findOne({ _id: sid })
          expect(session).not.toBe(null)
          assertSessionEquals(sid, data, session)
          cleanup(store, collection, resolve)
        }
      )
    })
  })

  test('test_session_cookie_overwrite_no_stringify', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(
        { stringify: false },
        async (store, db, collection) => {
          const origSession = makeData()
          const cookie = origSession.cookie
          const sid = 'test_set-sid'
          await store.set(sid, origSession)
          const session = await collection.findOne({ _id: sid })

          // Make sure cookie came out intact
          expect(origSession.cookie).toEqual(cookie)

          // Make sure the fields made it back intact
          expect(cookie.expires.toJSON()).toEqual(
            session.session.cookie.expires.toJSON()
          )
          expect(cookie.secure).toBe(session.session.cookie.secure)

          cleanup(store, collection, resolve)
        }
      )
    })
  })

  test('test_get', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_get-sid'
        const testData = { key1: 1, key2: 'two' }
        await collection.insertOne({
          _id: sid,
          session: JSON.stringify(testData),
        })
        store.get(sid, (err, session) => {
          expect(err).toBeNull()
          expect(session).toEqual(testData)
          cleanup(store, collection, resolve)
        })
      })
    })
  })

  test('test_get_promise', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_get_promise-sid'
        const testData = { key1: 1, key2: 'two' }
        await collection.insertOne({
          _id: sid,
          session: JSON.stringify(testData),
        })
        const session = await store.get(sid)
        expect(session).toEqual(testData)
        cleanup(store, collection, resolve)
      })
    })
  })

  test('test_all', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_all-sid'
        const testData = { key1: 1, key2: 'two' }
        await collection.insertOne({
          _id: sid,
          session: JSON.stringify(testData),
        })
        store.all((err, sessions) => {
          expect(err).toBeNull()
          expect(sessions.length).toBe(1)
          expect(sessions[0]).toEqual(testData)
          cleanup(store, collection, resolve)
        })
      })
    })
  })

  test('test_all_promise', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_all_promise-sid'
        const testData = { key1: 1, key2: 'two' }
        await collection.insertOne({
          _id: sid,
          session: JSON.stringify(testData),
        })
        const sessions = await store.all()
        expect(sessions.length).toBe(1)
        expect(sessions[0]).toEqual(testData)
        cleanup(store, collection, resolve)
      })
    })
  })

  test('test_length', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_length-sid'
        const testData = { key1: 1, key2: 'two' }
        await collection.insertOne({
          _id: sid,
          session: JSON.stringify(testData),
        })
        store.length((err, length) => {
          expect(err).toBeNull()
          expect(length).toBe(1)
          cleanup(store, collection, resolve)
        })
      })
    })
  })

  test('test_length_promise', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_length_promise-sid'
        const testData = { key1: 1, key2: 'two' }
        await collection.insertOne({
          _id: sid,
          session: JSON.stringify(testData),
        })
        const length = await store.length()
        expect(length).toBe(1)
        cleanup(store, collection, resolve)
      })
    })
  })

  test('test_destroy_ok', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_destroy_ok-sid'
        const testData = { key1: 1, key2: 'two' }
        await collection.insertOne({
          _id: sid,
          session: JSON.stringify(testData),
        })
        store.destroy(sid, (err) => {
          expect(err).toBeNull()
          cleanup(store, collection, resolve)
        })
      })
    })
  })

  test('test_destroy_ok_promise', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_destroy_ok_promise-sid'
        const testData = { key1: 1, key2: 'two' }
        await collection.insertOne({
          _id: sid,
          session: JSON.stringify(testData),
        })
        await expect(store.destroy(sid)).resolves.toBe(false)
        cleanup(store, collection, resolve)
      })
    })
  })

  test('test_destroy_ok_event', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_destroy_ok_event-sid'
        const testData = { key1: 1, key2: 'two' }
        await collection.insertOne({
          _id: sid,
          session: JSON.stringify(testData),
        })
        store.on('destroy', (sessionId) => {
          expect(sessionId).toBe(sid)
          cleanup(store, collection, resolve)
        })
        store.destroy(sid)
      })
    })
  })

  test('test_clear', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_length-sid'
        const testData = { _id: sid, key1: 1, key2: 'two' }
        await collection.insertOne(testData)
        store.clear(async () => {
          const count = await collection.countDocuments()
          expect(count).toBe(0)
          await store.close()
          resolve()
        })
      })
    })
  })

  test('test_clear_promise', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_length-sid'
        const testData = { _id: sid, key1: 1, key2: 'two' }
        await collection.insertOne(testData)
        await store.clear()
        const count = await collection.countDocuments()
        expect(count).toBe(0)
        await store.close()
        resolve()
      })
    })
  })

  test('test_options_url', () => {
    return new Promise((resolve) => {
      const store = new MongoStore({
        url: connectionString,
        collection: 'sessions-test',
      })
      store.once('connected', function () {
        expect(store.db.databaseName).toBe('connect-mongo-test')
        expect(store.collection.collectionName).toBe('sessions-test')
        store.close().then(resolve)
      })
    })
  })

  test('test_options_no_db', () => {
    expect(() => {
      return new MongoStore({})
    }).toThrow()
  })

  test('test_set_with_mongoose_db', () => {
    return new Promise((resolve) => {
      openDb(
        { mongooseConnection: getMongooseConnection() },
        async (store, db, collection) => {
          const sid = 'test_set-sid'
          const data = makeData()
          await store.set(sid)
          const session = await collection.findOne({ _id: sid })
          expect(session).not.toBe(null)
          assertSessionEquals(sid, data, session)
          cleanup(store, collection, resolve)
          resolve()
        }
      )
    })
  })

  test('test_set_with_promise_db', () => {
    return new Promise((resolve) => {
      openDb(
        { clientPromise: getClientPromise() },
        async (store, db, collection) => {
          const sid = 'test_set-sid'
          const data = makeData()
          await store.set(sid)
          const session = await collection.findOne({ _id: sid })
          expect(session).not.toBe(null)
          assertSessionEquals(sid, data, session)
          cleanup(store, collection, resolve)
          resolve()
        }
      )
    })
  })

  // Memory store ONLY support callback but not promise!
  test('test_set_with_memory_db', () => {
    return new Promise((resolve) => {
      const store = new MongoStore({ fallbackMemory: true })
      const sid = 'test_set_memory-sid'
      const data = makeData()
      store.set(sid, data, async (err) => {
        expect(err).toBeFalsy()
        store.get(sid, (err, session) => {
          expect(err).toBeNull()
          for (const prop in session.session) {
            if (prop === 'cookie') {
              // Make sure the cookie is intact
              expect(session.session.cookie).toEqual(data.cookie.toJSON())
            } else {
              expect(session.session[prop]).toEqual(data[prop])
            }
          }
          resolve()
        })
      })
    })
  })

  test('test_set_default_expiration', () => {
    return new Promise((resolve) => {
      const defaultTTL = 10
      getNativeDbConnection(
        { ttl: defaultTTL },
        async (store, db, collection) => {
          const sid = 'test_set_expires-sid'
          const data = makeDataNoCookie()
          const timeBeforeSet = new Date().valueOf()
          await store.set(sid, data)
          const session = await collection.findOne({ _id: sid })
          expect(session.session).toBe(JSON.stringify(data))
          expect(session._id).toEqual(sid)
          expect(session.expires).not.toBe(null)
          const timeAfterSet = new Date().valueOf()
          expect(timeBeforeSet + defaultTTL * 1000).toBeLessThanOrEqual(
            session.expires.valueOf()
          )
          expect(session.expires.valueOf()).toBeLessThanOrEqual(
            timeAfterSet + defaultTTL * 1000
          )
          cleanup(store, collection, resolve)
        }
      )
    })
  })

  test('test_set_without_default_expiration', () => {
    return new Promise((resolve) => {
      const defaultExpirationTime = 1000 * 60 * 60 * 24 * 14
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_set_expires-sid'
        const data = makeDataNoCookie()
        const timeBeforeSet = new Date().valueOf()
        await store.set(sid, data)
        const session = await collection.findOne({ _id: sid })
        expect(session.session).toBe(JSON.stringify(data))
        expect(session._id).toEqual(sid)
        expect(session.expires).not.toBe(null)
        const timeAfterSet = new Date().valueOf()
        expect(timeBeforeSet + defaultExpirationTime).toBeLessThanOrEqual(
          session.expires.valueOf()
        )
        expect(session.expires.valueOf()).toBeLessThanOrEqual(
          timeAfterSet + defaultExpirationTime
        )
        cleanup(store, collection, resolve)
      })
    })
  })

  test('test_set_custom_serializer', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(
        {
          serialize(obj) {
            obj.ice = 'test-1'
            return JSON.stringify(obj)
          },
        },
        async (store, db, collection) => {
          const sid = 'test_set_custom_serializer-sid'
          const data = makeData()
          const dataWithIce = JSON.parse(JSON.stringify(data))
          dataWithIce.ice = 'test-1'
          await store.set(sid, data)
          const session = await collection.findOne({ _id: sid })
          expect(session.session).toBe(JSON.stringify(dataWithIce))
          expect(session._id).toEqual(sid)
          cleanup(store, collection, resolve)
        }
      )
    })
  })

  test('test_get_custom_unserializer', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(
        {
          unserialize(obj) {
            obj.ice = 'test-2'
            return obj
          },
        },
        async (store, db, collection) => {
          const sid = 'test_get_custom_unserializer-sid'
          const data = makeData()
          await store.set(sid, data)
          const session = await store.get(sid)
          data.ice = 'test-2'
          data.cookie = data.cookie.toJSON()
          expect(session).toEqual(data)
          cleanup(store, collection, resolve)
        }
      )
    })
  })

  test('test_session_touch', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(async (store, db, collection) => {
        const sid = 'test_touch-sid'
        const data = makeData()
        await store.set(sid, data)
        const session = await collection.findOne({ _id: sid })
        assertSessionEquals(sid, data, session)
        await store.touch(sid, session.session)
        const session2 = await collection.findOne({ _id: sid })
        // Check if both expiry date are different
        expect(session2.expires.getTime()).toBeGreaterThan(
          session.expires.getTime()
        )
        cleanup(store, collection, resolve)
      })
    })
  })

  test('test_session_lazy_touch_sync', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(
        { touchAfter: 2 },
        async (store, db, collection) => {
          const sid = 'test_lazy_touch-sid-sync'
          const data = makeData()
          await store.set(sid, data)
          const session = await collection.findOne({ _id: sid })
          const lastModifiedBeforeTouch = session.lastModified.getTime()
          await store.touch(sid, session)
          const session2 = await collection.findOne({ _id: sid })
          const lastModifiedAfterTouch = session2.lastModified.getTime()
          expect(lastModifiedBeforeTouch).toBe(lastModifiedAfterTouch)
          cleanup(store, collection, resolve)
        }
      )
    })
  })

  test('test_session_lazy_touch_async', () => {
    return new Promise((resolve) => {
      getNativeDbConnection(
        { touchAfter: 2 },
        async (store, db, collection) => {
          const sid = 'test_lazy_touch-sid'
          const data = makeData()
          await store.set(sid, data)
          const session = await collection.findOne({ _id: sid })
          const lastModifiedBeforeTouch = session.lastModified.getTime()
          setTimeout(async () => {
            await store.touch(sid, session)
            const session2 = await collection.findOne({ _id: sid })
            const lastModifiedAfterTouch = session2.lastModified.getTime()
            expect(lastModifiedAfterTouch).toBeGreaterThan(
              lastModifiedBeforeTouch
            )
            cleanup(store, collection, resolve)
          }, 2200)
        }
      )
    })
  })
})
