
/**
 * Module dependencies.
 */

var MongoStore = require('connect-mongo');
var assert = require('assert');

var options = {db: 'connect-mongo-test'};
var mongo = require('mongodb');

var open_db = function(callback) {
  var store = new MongoStore(options, function() {
    var db = new mongo.Db(options.db, new mongo.Server('127.0.0.1', 27017, {}));

    db.open(function(err) {
      db.collection('sessions', function(err, collection) {
        callback(store, db, collection);
      });
    });
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
  open_db(function(store, db, collection) {
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

exports.test_get = function(done) {
  open_db(function(store, db, collection) {
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
  open_db(function(store, db, collection) {
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
  open_db(function(store, db, collection) {
    var sid = 'test_destroy_ok-sid';
    collection.insert({_id: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, function(error, ids) {
      store.destroy(sid, function(err) {
        assert.strictEqual(err, null);
        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_clear = function(done) {
  open_db(function(store, db, collection) {
    var sid = 'test_length-sid';
    collection.insert({_id: sid, key1: 1, key2: 'two'}, function(error, ids) {
      store.clear(function(err) {
        
        
        cleanup(store, db, collection, function() {
          done();
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