
/**
 * Module dependencies.
 */

var connect = require('connect');
var MongoStore = require('../')(connect);
var assert = require('assert');

var options = {db: 'connect-mongo-test'};
var mongo = require('mongodb');

var mongoose = require('mongoose');
var testMongooseDb = mongoose.connect('mongodb://127.0.0.1:27017/connect-mongo-test');
var options_with_mongoose_connection = { mongoose_connection: testMongooseDb.connections[0] };

var testMongoNativeDb = new mongo.Db("connect-mongo-test", new mongo.Server('127.0.0.1', 27017, {}));
var options_with_mongo_native_db = {db: testMongoNativeDb}

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
  var store = new MongoStore(options, function() {
    var db;
    if (options.mongoose_connection) {
      db = new mongo.Db(options.mongoose_connection.db.databaseName,
        new mongo.Server(options.mongoose_connection.db.serverConfig.host,
          options.mongoose_connection.db.serverConfig.port,
          options.mongoose_connection.db.serverConfig.options
        ));
    } else if (typeof options.db == "object") {
      db = options.db
    } else {
      db = new mongo.Db(options.db, new mongo.Server('127.0.0.1', 27017, {}));
    }
    
    if (db.openCalled) {
      auth_or_not(store, db, options, callback);
    } else {
      db.open(function(err) {
        auth_or_not(store, db, options, callback);
      });
    }

  });  
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
    store.set(sid, {foo:'bar'}, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert.deepEqual(session,
                         {
                           session: JSON.stringify({foo: 'bar'}),
                           _id: sid
                         });
        
        cleanup(store, db, collection, function() {
          done();
        });
      });  
    });
  });
};

exports.test_set_no_stringify = function(done) {
  open_db({db: options.db, stringify: false}, function(store, db, collection) {
    var sid = 'test_set-sid';
    store.set(sid, {foo: 'bar'}, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert.deepEqual(session,
                         {
                           session: {foo: 'bar'},
                           _id: sid
                         });
        
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
    var data = {
      foo:'bar',
      cookie:
      {
        _expires: '2011-04-26T03:10:12.890Z'
      }
    };
    
    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert.deepEqual(session.session, JSON.stringify(data));
        assert.strictEqual(session._id, sid);
        assert.equal(session.expires.toJSON(), new Date(data.cookie._expires).toJSON());
        
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
    url: 'mongodb://127.0.0.1:27017/connect-mongo-test/sessions-test'
  }, function() {
    assert.strictEqual(store.db.databaseName, 'connect-mongo-test');
    assert.strictEqual(store.db.serverConfig.host, '127.0.0.1');
    assert.equal(store.db.serverConfig.port, 27017);
    assert.equal(store.collection.collectionName, 'sessions-test');
    cleanup_store(store);
    done();
  });
};

exports.test_options_url_auth = function(done) {
  var store = new MongoStore({
    url: 'mongodb://test:test@127.0.0.1:27017/connect-mongo-test/sessions-test'
  }, function() {
    assert.strictEqual(store.db.databaseName, 'connect-mongo-test');
    assert.strictEqual(store.db.serverConfig.host, '127.0.0.1');
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
    url: 'mongodb://test:test@127.0.0.1:27017/',
    db : 'connect-mongo-test',
    collection:'sessions-test'
  }, function() {
    assert.strictEqual(store.db.databaseName, 'connect-mongo-test');
    assert.strictEqual(store.db.serverConfig.host, '127.0.0.1');
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
    store.set(sid, {foo:'bar'}, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert.deepEqual(session,
          {
            session: JSON.stringify({foo: 'bar'}),
            _id: sid
          });

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
    store.set(sid, {foo: 'bar'}, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert.deepEqual(session,
                         {
                           session: {foo: 'bar'},
                           _id: sid
                         });
        
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
    var data = {
      foo:'bar',
      cookie:
      {
        _expires: '2011-04-26T03:10:12.890Z'
      }
    };
    
    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert.deepEqual(session.session, JSON.stringify(data));
        assert.strictEqual(session._id, sid);
        assert.equal(session.expires.toJSON(), new Date(data.cookie._expires).toJSON());
        
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
    store.set(sid, {foo:'bar'}, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert.deepEqual(session,
          {
            session: JSON.stringify({foo: 'bar'}),
            _id: sid
          });

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
    store.set(sid, {foo: 'bar'}, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert.deepEqual(session,
                         {
                           session: {foo: 'bar'},
                           _id: sid
                         });
        
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
    var data = {
      foo:'bar',
      cookie:
      {
        _expires: '2011-04-26T03:10:12.890Z'
      }
    };
    
    store.set(sid, data, function(err, session) {
      assert.strictEqual(err, null);

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        assert.deepEqual(session.session, JSON.stringify(data));
        assert.strictEqual(session._id, sid);
        assert.equal(session.expires.toJSON(), new Date(data.cookie._expires).toJSON());
        
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
