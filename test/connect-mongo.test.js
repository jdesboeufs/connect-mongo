
/**
 * Module dependencies.
 */

var connect = require('connect');
var MongoStore = require('../')(connect);
var assert = require('assert');

var defaultOptions = {w: 1};
var testDb = 'connect-mongo-test'
var testHost = '127.0.0.1'
var options = {db: testDb, host: testHost};
var mongo = require('mongodb');

var mongoose = require('mongoose');
var testMongooseDb = mongoose.connect('mongodb://' + testHost + ':27017/' + testDb + '');
var options_with_mongoose_connection = { mongoose_connection: testMongooseDb.connections[0] };

var testMongoNativeDb = new mongo.Db(testDb, new mongo.Server(testHost, 27017, {}), { w: defaultOptions.w });
var options_with_mongo_native_db = {db: testMongoNativeDb}

// Create a connect cookie instance
var make_cookie = function() {
  var cookie = new connect.session.Cookie();
  cookie.maxAge = 10000; // This sets cookie.expire through a setter
  cookie.secure = true;
  cookie.domain = 'cow.com';

  return cookie;
};

// Create session data
var make_data = function() {
  return {
    foo: 'bar',
    baz: {
      cow: 'moo',
      chicken: 'cluck'
    },
    num: 1,
    cookie: make_cookie()
  };
};

var make_data_no_cookie = function() {
  return {
    foo: 'bar',
    baz: {
      cow: 'moo',
      fish: 'blub',
      fox: 'nobody knows!'
    },
    num: 2
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

var auth_or_not = function(store, db, options, callback){
  if (options.username && options.password) {
    db.authenticate(options.username, options.password, function () {
      db.collection('sessions', function(err, collection) {
        callback(store, db, collection);
      });
    });
  } else {
    db.collection('sessions', function(err, collection) {
      callback(store, db, collection);
    });
  }
};

var open_db = function(options, callback) {
  var store = new MongoStore(options);
  var db;

  if (options.mongoose_connection) {
    db = new mongo.Db(options.mongoose_connection.db.databaseName,
      new mongo.Server(options.mongoose_connection.db.serverConfig.host,
        options.mongoose_connection.db.serverConfig.port,
        options.mongoose_connection.db.serverConfig.options
      ),
      { w: options.w || defaultOptions.w });
  } else if (typeof options.db == "object") {
    db = options.db
  } else {
    db = new mongo.Db(options.db, new mongo.Server(testHost, 27017, {}), { w: options.w || defaultOptions.w });
  }

  if (db.openCalled) {
    auth_or_not(store, db, options, callback);
  } else {
    db.open(function(err) {
      auth_or_not(store, db, options, callback);
    });
  }
};

var cleanup_store = function(store) {
  store.db.close();
};

var cleanup = function(store, db, collection, callback) {
  collection.drop(function(err, result) {
    db.close();
    cleanup_store(store);

    callback && callback();
  });
};

exports.test_set = function(done) {
  open_db(options, function(store, db, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_set_no_stringify = function(done) {
  open_db({db: options.db, host: testHost, stringify: false}, function(store, db, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
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

  open_db({db: options.db, host: testHost, stringify: false}, function(store, db, collection) {
    var sid = 'test_set-sid';
    store.set(sid, origSession, function(err, session) {
      assert.strictEqual(err, null);

      collection.findOne({_id: sid}, function(err, session) {
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
  open_db(options, function(store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data();

    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};


exports.test_set_expires_no_stringify = function(done) {
  open_db({db: options.db, host: testHost, stringify: false}, function(store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data();

    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_get = function(done) {
  open_db(options, function(store, db, collection) {
    var sid = 'test_get-sid';
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, function(error, ids) {
      store.get(sid, function(err, session) {
        assert.deepEqual(session, {key1: 1, key2: 'two'});
        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_length = function(done) {
  open_db(options, function(store, db, collection) {
    var sid = 'test_length-sid';
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, function(error, ids) {
      store.length(function(err, length) {
        assert.strictEqual(err, null);
        assert.strictEqual(length, 1);
        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_destroy_ok = function(done) {
  open_db(options, function(store, db, collection) {
    var sid = 'test_destroy_ok-sid';
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, function(error, ids) {
      store.destroy(sid, function(err) {
        assert.strictEqual(err, undefined);
        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_clear = function(done) {
  open_db(options, function(store, db, collection) {
    var sid = 'test_length-sid';
    collection.insert({_id: sid, key1: 1, key2: 'two'}, function(error, ids) {
      store.clear(function(err) {
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

exports.test_options_url = function(done) {
  var store = new MongoStore({
    url: 'mongodb://' + testHost + ':27017/' + testDb + '/sessions-test'
  }, function() {
    assert.strictEqual(store.db.databaseName, testDb);
    assert.strictEqual(store.db.serverConfig.host, testHost);
    assert.equal(store.db.serverConfig.port, 27017);
    assert.equal(store.collection.collectionName, 'sessions-test');
    cleanup_store(store);
    done();
  });
};

exports.test_options_url_auth = function(done) {
  var store = new MongoStore({
    url: 'mongodb://test:test@' + testHost + ':27017/' + testDb + '/sessions-test'
  }, function() {
    assert.strictEqual(store.db.databaseName, testDb);
    assert.strictEqual(store.db.serverConfig.host, testHost);
    assert.equal(store.db.serverConfig.port, 27017);
    assert.equal(store.collection.collectionName, 'sessions-test');
    cleanup_store(store);
    done();
  });
};

exports.test_options_no_db = function(done) {
  assert.throws(
    function() {
      var store = new MongoStore({}, function() {});
    },
    Error);

  done();
};

exports.test_options_url_and_db = function(done){
  var store = new MongoStore({
    url: 'mongodb://test:test@' + testHost + ':27017/',
    db : testDb,
    collection:'sessions-test'
  }, function() {
    assert.strictEqual(store.db.databaseName, testDb);
    assert.strictEqual(store.db.serverConfig.host, testHost);
    assert.equal(store.db.serverConfig.port, 27017);
    assert.equal(store.collection.collectionName, 'sessions-test');
    cleanup_store(store);
    done();
  });
};

/* options.mongoose_connection tests */

exports.test_set_with_raw_db = function(done) {
  open_db(options_with_mongoose_connection, function(store, db, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_set_no_stringify_with_raw_db = function(done) {
  open_db({mongoose_connection: options_with_mongoose_connection.mongoose_connection, stringify: false}, function(store, db, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_set_expires_with_raw_db = function(done) {
  open_db(options_with_mongoose_connection, function(store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data();

    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};


exports.test_set_expires_no_stringify_with_raw_db = function(done) {
  var options = {
    mongoose_connection: options_with_mongoose_connection.mongoose_connection,
    stringify: false
  };

  open_db(options, function(store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data();

    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_get_with_raw_db = function(done) {
  open_db(options_with_mongoose_connection, function(store, db, collection) {
    var sid = 'test_get-sid';
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, function(error, ids) {
      store.get(sid, function(err, session) {
        assert.strictEqual(err, null);
        assert.deepEqual(session, {key1: 1, key2: 'two'});

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_length_with_raw_db = function(done) {
  open_db(options_with_mongoose_connection, function(store, db, collection) {
    var sid = 'test_length-sid';
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, function(error, ids) {
      store.length(function(err, length) {
        assert.strictEqual(err, null);
        assert.strictEqual(length, 1);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_destroy_ok_with_raw_db = function(done) {
  open_db(options_with_mongoose_connection, function(store, db, collection) {
    var sid = 'test_destroy_ok-sid';
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, function(error, ids) {
      store.destroy(sid, function(err) {
        assert.strictEqual(err, undefined);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_clear_with_raw_db = function(done) {
  open_db(options_with_mongoose_connection, function(store, db, collection) {
    var sid = 'test_length-sid';
    collection.insert({_id: sid, key1: 1, key2: 'two'}, function(error, ids) {
      store.clear(function(err) {
        collection.count(function(err, count) {
          assert.strictEqual(err, null);
          assert.strictEqual(count, 0);

          cleanup(store, db, collection, function() {
            done();
          });
        });
      });
    });
  });
};

exports.test_options_bad_db_with_raw_db = function(done) {
  assert.throws(
    function() {
      var store = new MongoStore({mongoose_connection: 'foobar'}, function() {});
    },
    Error);

  done();
};

/* tests with existing mongodb native db object */

exports.test_set_with_native_db = function(done) {
  open_db(options_with_mongo_native_db, function(store, db, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_set_no_stringify_with_native_db = function(done) {
  open_db({db: options_with_mongo_native_db.db, stringify: false}, function(store, db, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_set_expires_with_native_db = function(done) {
  open_db(options_with_mongo_native_db, function(store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data();

    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};


exports.test_set_expires_no_stringify_with_native_db = function(done) {
  var options = {
    db: options_with_mongo_native_db.db,
    stringify: false
  };

  open_db(options, function(store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data();

    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_get_with_native_db = function(done) {
  open_db(options_with_mongo_native_db, function(store, db, collection) {
    var sid = 'test_get-sid';
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, function(error, ids) {
      store.get(sid, function(err, session) {
        assert.strictEqual(err, null);
        assert.deepEqual(session, {key1: 1, key2: 'two'});

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_length_with_native_db = function(done) {
  open_db(options_with_mongo_native_db, function(store, db, collection) {
    var sid = 'test_length-sid';
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, function(error, ids) {
      store.length(function(err, length) {
        assert.strictEqual(err, null);
        assert.strictEqual(length, 1);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_destroy_ok_with_native_db = function(done) {
  open_db(options_with_mongo_native_db, function(store, db, collection) {
    var sid = 'test_destroy_ok-sid';
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, function(error, ids) {
      store.destroy(sid, function(err) {
        assert.strictEqual(err, undefined);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_clear_with_native_db = function(done) {
  open_db(options_with_mongo_native_db, function(store, db, collection) {
    var sid = 'test_length-sid';
    collection.insert({_id: sid, key1: 1, key2: 'two'}, function(error, ids) {
      store.clear(function(err) {
        collection.count(function(err, count) {
          assert.strictEqual(err, null);
          assert.strictEqual(count, 0);

          cleanup(store, db, collection, function() {
            done();
          });
        });
      });
    });
  });
};

exports.test_options_bad_db_with_native_db = function(done) {
  assert.throws(
    function() {
      var store = new MongoStore({db: {}}, function() {});
    },
    Error);

  done();
};

exports.test_set_default_expiration = function(done) {
  var defaultExpirationTime = 10101;
  var optionsWithExpirationTime = JSON.parse(JSON.stringify(options));
  optionsWithExpirationTime['defaultExpirationTime'] = defaultExpirationTime;

  open_db(optionsWithExpirationTime, function(store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data_no_cookie();

    var timeBeforeSet = new Date().valueOf();

    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
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

exports.test_set_witout_default_expiration = function(done) {
  var defaultExpirationTime = 1000 * 60 * 60 * 24 * 14;
  open_db(options, function(store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data_no_cookie();

    var timeBeforeSet = new Date().valueOf();

    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
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
