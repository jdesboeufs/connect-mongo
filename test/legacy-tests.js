'use strict';
/* eslint camelcase: off, no-var: off */

/**
 * Module dependencies.
 */
const expressSession = require('express-session');
const MongoStore = require('../')(expressSession);
var assert = require('assert');

var connectionString = process.env.MONGODB_URL || 'mongodb://localhost/connect-mongo-test';

var mongo = require('mongodb');
var mongoose = require('mongoose');

// Create a connect cookie instance
var make_cookie = function() {
  var cookie = new expressSession.Cookie();
  cookie.maxAge = 10000; // This sets cookie.expire through a setter
  cookie.secure = true;
  cookie.domain = 'cow.com';

  return cookie;
};

function getMongooseConnection() {
  return mongoose.createConnection(connectionString);
}

function getDbPromise() {
  return new Promise(function (resolve, reject) {
    mongo.MongoClient.connect(connectionString, function (err, db) {
      if (err) return reject(err);
      resolve(db);
    });
  });
}

// Create session data
var make_data = function() {
  return {
    foo: 'bar',
    baz: {
      cow: 'moo',
      chicken: 'cluck',
    },
    num: 1,
    cookie: make_cookie(),
  };
};

var make_data_no_cookie = function() {
  return {
    foo: 'bar',
    baz: {
      cow: 'moo',
      fish: 'blub',
      fox: 'nobody knows!',
    },
    num: 2,
  };
};

// Given a session id, input data, and session, make sure the stored data matches in the input data
var assert_session_equals = function(sid, data, session) {
  if (typeof session.session === 'string') {
    // Compare stringified JSON
    assert.strictEqual(session.session, JSON.stringify(data));
  }
  else {
    // Can't do a deepEqual for the whole session as we need the toJSON() version of the cookie
    // Make sure the session data in intact
    for (var prop in session.session) {
      if (prop === 'cookie') {
        // Make sure the cookie is intact
        assert.deepEqual(session.session.cookie, data.cookie.toJSON());
      }
      else {
        assert.deepEqual(session.session[prop], data[prop]);
      }
    }
  }

  // Make sure the ID matches
  assert.strictEqual(session._id, sid);
};

var open_db = function(options, callback) {
  var store = new MongoStore(options);
  store.once('connected', function () {
    callback(this, this.db, this.collection);
  });
};

var cleanup_store = function(store) {
  store.db.close();
};

var cleanup = function(store, db, collection, callback) {
  collection.drop(function() {
    db.close();
    cleanup_store(store);
    callback();
  });
};

function getNativeDbConnection(options, done) {
  if (!done) {
    done = options;
    options = {};
  }
  mongo.MongoClient.connect(connectionString, function (err, db) {
    if (err) return done(err);
    open_db(Object.assign(options, { db: db }), done);
  });
}

exports.test_set = function(done) {
  getNativeDbConnection(function(store, db, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ _id: sid }, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_set_no_stringify = function(done) {
  getNativeDbConnection({ stringify: false }, function(store, db, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ _id: sid }, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_session_cookie_overwrite_no_stringify = function(done) {
  var origSession = make_data();
  var cookie = origSession.cookie;

  getNativeDbConnection({ stringify: false }, function(store, db, collection) {
    var sid = 'test_set-sid';
    store.set(sid, origSession, function(err) {
      assert.equal(err, null);

      collection.findOne({ _id: sid }, function(err, session) {
        // Make sure cookie came out intact
        assert.strictEqual(origSession.cookie, cookie);

        // Make sure the fields made it back intact
        assert.equal(cookie.expires.toJSON(), session.session.cookie.expires.toJSON());
        assert.equal(cookie.secure, session.session.cookie.secure);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_set_expires = function(done) {
  getNativeDbConnection(function(store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data();

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ _id: sid }, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};


exports.test_set_expires_no_stringify = function(done) {
  getNativeDbConnection({ stringify: false }, function(store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data();

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ _id: sid }, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_get = function(done) {
  getNativeDbConnection(function(store, db, collection) {
    var sid = 'test_get-sid';
    collection.insert({ _id: sid, session: JSON.stringify({ key1: 1, key2: 'two' }) }, function() {
      store.get(sid, function(err, session) {
        assert.deepEqual(session, { key1: 1, key2: 'two' });
        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_length = function(done) {
  getNativeDbConnection(function(store, db, collection) {
    var sid = 'test_length-sid';
    collection.insert({ _id: sid, session: JSON.stringify({ key1: 1, key2: 'two' }) }, function () {
      store.length(function(err, length) {
        assert.equal(err, null);
        assert.strictEqual(length, 1);
        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_destroy_ok = function(done) {
  getNativeDbConnection(function(store, db, collection) {
    var sid = 'test_destroy_ok-sid';
    collection.insert({ _id: sid, session: JSON.stringify({ key1: 1, key2: 'two' }) }, function() {
      store.destroy(sid, function(err) {
        assert.equal(err, null);
        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_clear = function(done) {
  getNativeDbConnection(function(store, db, collection) {
    var sid = 'test_length-sid';
    collection.insert({ _id: sid, key1: 1, key2: 'two' }, function() {
      store.clear(function() {
        collection.count(function(err, count) {
          assert.strictEqual(count, 0);

          cleanup(store, db, collection, function() {
            done();
          });
        });
      });
    });
  });
};

// exports.test_options_url = function(done) {
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

exports.new_connection_failure = function(done) {
  var originalException = process.listeners('uncaughtException').pop();
  process.removeListener('uncaughtException', originalException);
  (function () {
    return new MongoStore({
      url: 'mongodb://localhost:27018/connect-mongo-test',
      collection: 'sessions-test',
    });
  })();
  process.once('uncaughtException', function () {
    process.listeners('uncaughtException').push(originalException);
    done();
  });
};

exports.test_options_no_db = function(done) {
  assert.throws(
    function() {
      new MongoStore({});
    },
    Error);

  done();
};

/* options.mongooseConnection tests */

exports.test_set_with_mongoose_db = function(done) {
  open_db({ mongooseConnection: getMongooseConnection() }, function(store, db, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ _id: sid }, function (err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

/* options.dbPromise tests */

exports.test_set_with_promise_db = function(done) {
  open_db({ dbPromise: getDbPromise() }, function(store, db, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ _id: sid }, function (err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

/* tests with existing mongodb native db object */

exports.test_set_with_native_db = function(done) {
  getNativeDbConnection(function(store, db, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ _id: sid }, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};


exports.test_set_default_expiration = function(done) {
  var defaultTTL = 10;
  getNativeDbConnection({ ttl: defaultTTL }, function(store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data_no_cookie();

    var timeBeforeSet = new Date().valueOf();

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ _id: sid }, function(err, session) {
        assert.deepEqual(session.session, JSON.stringify(data));
        assert.strictEqual(session._id, sid);
        assert.notEqual(session.expires, null);

        var timeAfterSet = new Date().valueOf();

        assert.ok(timeBeforeSet + defaultTTL * 1000 <= session.expires.valueOf());
        assert.ok(session.expires.valueOf() <= timeAfterSet + defaultTTL * 1000);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_set_without_default_expiration = function(done) {
  var defaultExpirationTime = 1000 * 60 * 60 * 24 * 14;
  getNativeDbConnection(function(store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data_no_cookie();

    var timeBeforeSet = new Date().valueOf();

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ _id: sid }, function(err, session) {
        assert.deepEqual(session.session, JSON.stringify(data));
        assert.strictEqual(session._id, sid);
        assert.notEqual(session.expires, null);

        var timeAfterSet = new Date().valueOf();

        assert.ok(timeBeforeSet + defaultExpirationTime <= session.expires.valueOf());
        assert.ok(session.expires.valueOf() <= timeAfterSet + defaultExpirationTime);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_set_custom_serializer = function (done) {
  getNativeDbConnection({
    serialize: function (obj) {
      obj.ice = 'test-1';
      return JSON.stringify(obj);
    }
  }, function (store, db, collection) {
    var sid = 'test_set_custom_serializer-sid';
    var data = make_data(),
      dataWithIce = JSON.parse(JSON.stringify(data));

    dataWithIce.ice = 'test-1';
    store.set(sid, data, function (err) {
      assert.equal(err, null);

      collection.findOne({ _id: sid }, function (err, session) {
        assert.deepEqual(session.session, JSON.stringify(dataWithIce));
        assert.strictEqual(session._id, sid);

        cleanup(store, db, collection, done);
      });
    });
  });
};

exports.test_get_custom_unserializer = function (done) {
  getNativeDbConnection({
    unserialize: function (obj) {
      obj.ice = 'test-2';
      return obj;
    }
  }, function (store, db, collection) {
    var sid = 'test_get_custom_unserializer-sid';
    var data = make_data();
    store.set(sid, data, function (err) {
      assert.equal(err, null);
      store.get(sid, function (err, session) {
        data.ice = 'test-2';
        data.cookie = data.cookie.toJSON();
        assert.equal(err, null);
        assert.deepEqual(session, data);
        cleanup(store, db, collection, done);
      });
    });
  });
};


exports.test_session_touch = function(done) {
  getNativeDbConnection(function(store, db, collection) {

    var sid = 'test_touch-sid',
      data = make_data();

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ _id: sid }, function(err, session) {
        assert.equal(err, null);
        assert_session_equals(sid, data, session);

        // touch the session
        store.touch(sid, session.session, function(err) {
          assert.equal(err, null);

          // find the touched session
          collection.findOne({ _id: sid }, function(err, session2) {
            assert.equal(err, null);

            // check if both expiry date are different
            assert.ok(session2.expires.getTime() > session.expires.getTime());

            cleanup(store, db, collection, function() {
              done();
            });

          });
        });
      });
    });
  });
};

exports.test_session_lazy_touch_sync = function(done) {
  getNativeDbConnection({ touchAfter: 2 }, function(store, db, collection) {

    var sid = 'test_lazy_touch-sid-sync',
      data = make_data(),
      lastModifiedBeforeTouch,
      lastModifiedAfterTouch;

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ _id: sid }, function(err, session) {
        assert.equal(err, null);

        lastModifiedBeforeTouch = session.lastModified.getTime();

        // touch the session
        store.touch(sid, session, function(err) {
          assert.equal(err, null);

          collection.findOne({ _id: sid }, function(err, session2) {
            assert.equal(err, null);

            lastModifiedAfterTouch = session2.lastModified.getTime();

            assert.strictEqual(lastModifiedBeforeTouch, lastModifiedAfterTouch);

            cleanup(store, db, collection, function() {
              done();
            });

          });
        });
      });
    });
  });
};


exports.test_session_lazy_touch_async = function(done) {
  getNativeDbConnection({ touchAfter: 2 }, function(store, db, collection) {

    var sid = 'test_lazy_touch-sid',
      data = make_data(),
      lastModifiedBeforeTouch,
      lastModifiedAfterTouch;

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ _id: sid }, function(err, session) {
        assert.equal(err, null);

        lastModifiedBeforeTouch = session.lastModified.getTime();

        setTimeout(function () {

          // touch the session
          store.touch(sid, session, function(err) {
            assert.equal(err, null);

            collection.findOne({ _id: sid }, function(err, session2) {
              assert.equal(err, null);

              lastModifiedAfterTouch = session2.lastModified.getTime();

              assert.ok(lastModifiedAfterTouch > lastModifiedBeforeTouch);

              cleanup(store, db, collection, function() {
                done();
              });

            });
          });

        }, 3000);

      });
    });
  });
};
