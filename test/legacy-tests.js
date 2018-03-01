'use strict'

const expressSession = require('express-session')
const MongoStore = require('..')(expressSession)
const assert = require('assert')

const connectionString = process.env.MONGODB_URL || 'mongodb://localhost/connect-mongo-test'

const mongo = require('mongodb')
const mongoose = require('mongoose')

// Create a connect cookie instance
const make_cookie = function () {
  const cookie = new expressSession.Cookie()
  cookie.maxAge = 10000 // This sets cookie.expire through a setter
  cookie.secure = true
  cookie.domain = 'cow.com'

  return cookie
}

function getMongooseConnection() {
  return mongoose.createConnection(connectionString)
}

function getDbPromise() {
  return new Promise((resolve, reject) => {
    mongo.MongoClient.connect(connectionString, (err, db) => {
      if (err) {
        return reject(err)
      }
      resolve(db)
    })
  })
}

// Create session data
const make_data = function () {
  return {
    foo: 'bar',
    baz: {
      cow: 'moo',
      chicken: 'cluck'
    },
    num: 1,
    cookie: make_cookie()
  }
}

const make_data_no_cookie = function () {
  return {
    foo: 'bar',
    baz: {
      cow: 'moo',
      fish: 'blub',
      fox: 'nobody knows!'
    },
    num: 2
  }
}

// Given a session id, input data, and session, make sure the stored data matches in the input data
const assert_session_equals = function (sid, data, session) {
  if (typeof session.session === 'string') {
    // Compare stringified JSON
    assert.strictEqual(session.session, JSON.stringify(data))
  } else {
    // Can't do a deepEqual for the whole session as we need the toJSON() version of the cookie
    // Make sure the session data in intact
    for (const prop in session.session) {
      if (prop === 'cookie') {
        // Make sure the cookie is intact
        assert.deepEqual(session.session.cookie, data.cookie.toJSON())
      } else {
        assert.deepEqual(session.session[prop], data[prop])
      }
    }
  }

  // Make sure the ID matches
  assert.strictEqual(session._id, sid)
}

const open_db = function (options, callback) {
  const store = new MongoStore(options)
  store.once('connected', function () {
    callback(this, this.db, this.collection)
  })
}

const cleanup_store = function (store) {
  store.db.close()
}

const cleanup = function (store, db, collection, callback) {
  collection.drop(() => {
    db.close()
    cleanup_store(store)
    callback()
  })
}

function getNativeDbConnection(options, done) {
  if (!done) {
    done = options
    options = {}
  }
  mongo.MongoClient.connect(connectionString, (err, db) => {
    if (err) {
      return done(err)
    }
    open_db(Object.assign(options, {db}), done)
  })
}

exports.test_set = function (done) {
  getNativeDbConnection((store, db, collection) => {
    const sid = 'test_set-sid'
    const data = make_data()

    store.set(sid, data, err => {
      assert.equal(err, null)

      // Verify it was saved
      collection.findOne({_id: sid}, (err, session) => {
        assert_session_equals(sid, data, session)

        cleanup(store, db, collection, () => {
          done()
        })
      })
    })
  })
}

exports.test_set_promise = function (done) {
  getNativeDbConnection((store, db, collection) => {
    const sid = 'test_set_promise-sid'
    const data = make_data()

    store.set(sid, data)
      .then(() => {
        // Verify it was saved
        collection.findOne({_id: sid}, (err, session) => {
          assert_session_equals(sid, data, session)

          cleanup(store, db, collection, () => {
            done()
          })
        })
      })
      .catch(done)
  })
}

exports.test_set_no_stringify = function (done) {
  getNativeDbConnection({stringify: false}, (store, db, collection) => {
    const sid = 'test_set-sid'
    const data = make_data()

    store.set(sid, data, err => {
      assert.equal(err, null)

      // Verify it was saved
      collection.findOne({_id: sid}, (err, session) => {
        assert_session_equals(sid, data, session)

        cleanup(store, db, collection, () => {
          done()
        })
      })
    })
  })
}

exports.test_session_cookie_overwrite_no_stringify = function (done) {
  const origSession = make_data()
  const cookie = origSession.cookie

  getNativeDbConnection({stringify: false}, (store, db, collection) => {
    const sid = 'test_set-sid'
    store.set(sid, origSession, err => {
      assert.equal(err, null)

      collection.findOne({_id: sid}, (err, session) => {
        // Make sure cookie came out intact
        assert.strictEqual(origSession.cookie, cookie)

        // Make sure the fields made it back intact
        assert.equal(cookie.expires.toJSON(), session.session.cookie.expires.toJSON())
        assert.equal(cookie.secure, session.session.cookie.secure)

        cleanup(store, db, collection, () => {
          done()
        })
      })
    })
  })
}

exports.test_set_expires = function (done) {
  getNativeDbConnection((store, db, collection) => {
    const sid = 'test_set_expires-sid'
    const data = make_data()

    store.set(sid, data, err => {
      assert.equal(err, null)

      // Verify it was saved
      collection.findOne({_id: sid}, (err, session) => {
        assert_session_equals(sid, data, session)

        cleanup(store, db, collection, () => {
          done()
        })
      })
    })
  })
}

exports.test_set_expires_no_stringify = function (done) {
  getNativeDbConnection({stringify: false}, (store, db, collection) => {
    const sid = 'test_set_expires-sid'
    const data = make_data()

    store.set(sid, data, err => {
      assert.equal(err, null)

      // Verify it was saved
      collection.findOne({_id: sid}, (err, session) => {
        assert_session_equals(sid, data, session)

        cleanup(store, db, collection, () => {
          done()
        })
      })
    })
  })
}

exports.test_get = function (done) {
  getNativeDbConnection((store, db, collection) => {
    const sid = 'test_get-sid'
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, () => {
      store.get(sid, (err, session) => {
        assert.deepEqual(session, {key1: 1, key2: 'two'})
        cleanup(store, db, collection, () => {
          done()
        })
      })
    })
  })
}

exports.test_get_promise = function (done) {
  getNativeDbConnection((store, db, collection) => {
    const sid = 'test_get_promise-sid'
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, () => {
      store.get(sid)
        .then(session => {
          assert.deepEqual(session, {key1: 1, key2: 'two'})
          cleanup(store, db, collection, () => {
            done()
          })
        })
        .catch(done)
    })
  })
}

exports.test_length = function (done) {
  getNativeDbConnection((store, db, collection) => {
    const sid = 'test_length-sid'
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, () => {
      store.length((err, length) => {
        assert.equal(err, null)
        assert.strictEqual(length, 1)
        cleanup(store, db, collection, () => {
          done()
        })
      })
    })
  })
}

exports.test_length_promise = function (done) {
  getNativeDbConnection((store, db, collection) => {
    const sid = 'test_length_promise-sid'
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, () => {
      store.length()
        .then(length => {
          assert.strictEqual(length, 1)
          cleanup(store, db, collection, () => {
            done()
          })
        })
        .catch(done)
    })
  })
}

exports.test_destroy_ok = function (done) {
  getNativeDbConnection((store, db, collection) => {
    const sid = 'test_destroy_ok-sid'
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, () => {
      store.destroy(sid, err => {
        assert.equal(err, null)
        cleanup(store, db, collection, () => {
          done()
        })
      })
    })
  })
}

exports.test_destroy_ok_promise = function (done) {
  getNativeDbConnection((store, db, collection) => {
    const sid = 'test_destroy_ok_promise-sid'
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, () => {
      store.destroy(sid)
        .then(() => {
          cleanup(store, db, collection, () => {
            done()
          })
        })
        .catch(done)
    })
  })
}

exports.test_clear = function (done) {
  getNativeDbConnection((store, db, collection) => {
    const sid = 'test_length-sid'
    collection.insert({_id: sid, key1: 1, key2: 'two'}, () => {
      store.clear(() => {
        collection.count((err, count) => {
          assert.strictEqual(count, 0)

          cleanup(store, db, collection, () => {
            done()
          })
        })
      })
    })
  })
}

exports.test_clear_promise = function (done) {
  getNativeDbConnection((store, db, collection) => {
    const sid = 'test_length-sid'
    collection.insert({_id: sid, key1: 1, key2: 'two'}, () => {
      store.clear()
        .then(() => {
          collection.count((err, count) => {
            assert.strictEqual(count, 0)

            cleanup(store, db, collection, () => {
              done()
            })
          })
        })
        .catch(done)
    })
  })
}

// Exports.test_options_url = function(done) {
//   var store = new MongoStore({
//     url: connectionString,
//     collection: 'sessions-test',
//   });
//   store.once('connected', function() {
//     assert.strictEqual(store.db.databaseName, 'connect-mongo-test');
//     assert.strictEqual(store.db.serverConfig.host, 'localhost');
//     assert.equal(store.db.serverConfig.port, 27017);
//     assert.equal(store.collection.collectionName, 'sessions-test');
//     cleanup_store(store);
//     done();
//   });
// };

exports.new_connection_failure = function (done) {
  const originalException = process.listeners('uncaughtException').pop()
  process.removeListener('uncaughtException', originalException);
  (function () {
    return new MongoStore({
      url: 'mongodb://localhost:27018/connect-mongo-test',
      collection: 'sessions-test'
    })
  })()
  process.once('uncaughtException', () => {
    process.listeners('uncaughtException').push(originalException)
    done()
  })
}

exports.test_options_no_db = function (done) {
  assert.throws(
    () => {
      new MongoStore({})
    },
    Error)

  done()
}

/* Options.mongooseConnection tests */

exports.test_set_with_mongoose_db = function (done) {
  open_db({mongooseConnection: getMongooseConnection()}, (store, db, collection) => {
    const sid = 'test_set-sid'
    const data = make_data()

    store.set(sid, data, err => {
      assert.equal(err, null)

      // Verify it was saved
      collection.findOne({_id: sid}, (err, session) => {
        assert_session_equals(sid, data, session)

        cleanup(store, db, collection, () => {
          done()
        })
      })
    })
  })
}

/* Options.dbPromise tests */

exports.test_set_with_promise_db = function (done) {
  open_db({dbPromise: getDbPromise()}, (store, db, collection) => {
    const sid = 'test_set-sid'
    const data = make_data()

    store.set(sid, data, err => {
      assert.equal(err, null)

      // Verify it was saved
      collection.findOne({_id: sid}, (err, session) => {
        assert_session_equals(sid, data, session)

        cleanup(store, db, collection, () => {
          done()
        })
      })
    })
  })
}

/* Tests with existing mongodb native db object */

exports.test_set_with_native_db = function (done) {
  getNativeDbConnection((store, db, collection) => {
    const sid = 'test_set-sid'
    const data = make_data()

    store.set(sid, data, err => {
      assert.equal(err, null)

      // Verify it was saved
      collection.findOne({_id: sid}, (err, session) => {
        assert_session_equals(sid, data, session)

        cleanup(store, db, collection, () => {
          done()
        })
      })
    })
  })
}

exports.test_set_default_expiration = function (done) {
  const defaultTTL = 10
  getNativeDbConnection({ttl: defaultTTL}, (store, db, collection) => {
    const sid = 'test_set_expires-sid'
    const data = make_data_no_cookie()

    const timeBeforeSet = new Date().valueOf()

    store.set(sid, data, err => {
      assert.equal(err, null)

      // Verify it was saved
      collection.findOne({_id: sid}, (err, session) => {
        assert.deepEqual(session.session, JSON.stringify(data))
        assert.strictEqual(session._id, sid)
        assert.notEqual(session.expires, null)

        const timeAfterSet = new Date().valueOf()

        assert.ok(timeBeforeSet + defaultTTL * 1000 <= session.expires.valueOf())
        assert.ok(session.expires.valueOf() <= timeAfterSet + defaultTTL * 1000)

        cleanup(store, db, collection, () => {
          done()
        })
      })
    })
  })
}

exports.test_set_without_default_expiration = function (done) {
  const defaultExpirationTime = 1000 * 60 * 60 * 24 * 14
  getNativeDbConnection((store, db, collection) => {
    const sid = 'test_set_expires-sid'
    const data = make_data_no_cookie()

    const timeBeforeSet = new Date().valueOf()

    store.set(sid, data, err => {
      assert.equal(err, null)

      // Verify it was saved
      collection.findOne({_id: sid}, (err, session) => {
        assert.deepEqual(session.session, JSON.stringify(data))
        assert.strictEqual(session._id, sid)
        assert.notEqual(session.expires, null)

        const timeAfterSet = new Date().valueOf()

        assert.ok(timeBeforeSet + defaultExpirationTime <= session.expires.valueOf())
        assert.ok(session.expires.valueOf() <= timeAfterSet + defaultExpirationTime)

        cleanup(store, db, collection, () => {
          done()
        })
      })
    })
  })
}

exports.test_set_custom_serializer = function (done) {
  getNativeDbConnection({
    serialize(obj) {
      obj.ice = 'test-1'
      return JSON.stringify(obj)
    }
  }, (store, db, collection) => {
    const sid = 'test_set_custom_serializer-sid'
    let data = make_data(),
      dataWithIce = JSON.parse(JSON.stringify(data))

    dataWithIce.ice = 'test-1'
    store.set(sid, data, err => {
      assert.equal(err, null)

      collection.findOne({_id: sid}, (err, session) => {
        assert.deepEqual(session.session, JSON.stringify(dataWithIce))
        assert.strictEqual(session._id, sid)

        cleanup(store, db, collection, done)
      })
    })
  })
}

exports.test_get_custom_unserializer = function (done) {
  getNativeDbConnection({
    unserialize(obj) {
      obj.ice = 'test-2'
      return obj
    }
  }, (store, db, collection) => {
    const sid = 'test_get_custom_unserializer-sid'
    const data = make_data()
    store.set(sid, data, err => {
      assert.equal(err, null)
      store.get(sid, (err, session) => {
        data.ice = 'test-2'
        data.cookie = data.cookie.toJSON()
        assert.equal(err, null)
        assert.deepEqual(session, data)
        cleanup(store, db, collection, done)
      })
    })
  })
}

exports.test_session_touch = function (done) {
  getNativeDbConnection((store, db, collection) => {
    let sid = 'test_touch-sid',
      data = make_data()

    store.set(sid, data, err => {
      assert.equal(err, null)

      // Verify it was saved
      collection.findOne({_id: sid}, (err, session) => {
        assert.equal(err, null)
        assert_session_equals(sid, data, session)

        // Touch the session
        store.touch(sid, session.session, err => {
          assert.equal(err, null)

          // Find the touched session
          collection.findOne({_id: sid}, (err, session2) => {
            assert.equal(err, null)

            // Check if both expiry date are different
            assert.ok(session2.expires.getTime() > session.expires.getTime())

            cleanup(store, db, collection, () => {
              done()
            })
          })
        })
      })
    })
  })
}

exports.test_session_touch_promise = function (done) {
  getNativeDbConnection((store, db, collection) => {
    let sid = 'test_touch_promise-sid',
      data = make_data()

    store.set(sid, data)
      .then(() => {
        // Verify it was saved
        collection.findOne({_id: sid}, (err, session) => {
          assert.equal(err, null)
          assert_session_equals(sid, data, session)

          // Touch the session
          store.touch(sid, session.session)
            .then(() => {
              // Find the touched session
              collection.findOne({_id: sid}, (err, session2) => {
                assert.equal(err, null)

                // Check if both expiry date are different
                assert.ok(session2.expires.getTime() > session.expires.getTime())

                cleanup(store, db, collection, () => {
                  done()
                })
              })
            })
            .catch(done)
        })
      })
      .catch(done)
  })
}

exports.test_session_lazy_touch_sync = function (done) {
  getNativeDbConnection({touchAfter: 2}, (store, db, collection) => {
    let sid = 'test_lazy_touch-sid-sync',
      data = make_data(),
      lastModifiedBeforeTouch,
      lastModifiedAfterTouch

    store.set(sid, data, err => {
      assert.equal(err, null)

      // Verify it was saved
      collection.findOne({_id: sid}, (err, session) => {
        assert.equal(err, null)

        lastModifiedBeforeTouch = session.lastModified.getTime()

        // Touch the session
        store.touch(sid, session, err => {
          assert.equal(err, null)

          collection.findOne({_id: sid}, (err, session2) => {
            assert.equal(err, null)

            lastModifiedAfterTouch = session2.lastModified.getTime()

            assert.strictEqual(lastModifiedBeforeTouch, lastModifiedAfterTouch)

            cleanup(store, db, collection, () => {
              done()
            })
          })
        })
      })
    })
  })
}

exports.test_session_lazy_touch_async = function (done) {
  getNativeDbConnection({touchAfter: 2}, (store, db, collection) => {
    let sid = 'test_lazy_touch-sid',
      data = make_data(),
      lastModifiedBeforeTouch,
      lastModifiedAfterTouch

    store.set(sid, data, err => {
      assert.equal(err, null)

      // Verify it was saved
      collection.findOne({_id: sid}, (err, session) => {
        assert.equal(err, null)

        lastModifiedBeforeTouch = session.lastModified.getTime()

        setTimeout(() => {
          // Touch the session
          store.touch(sid, session, err => {
            assert.equal(err, null)

            collection.findOne({_id: sid}, (err, session2) => {
              assert.equal(err, null)

              lastModifiedAfterTouch = session2.lastModified.getTime()

              assert.ok(lastModifiedAfterTouch > lastModifiedBeforeTouch)

              cleanup(store, db, collection, () => {
                done()
              })
            })
          })
        }, 3000)
      })
    })
  })
}
