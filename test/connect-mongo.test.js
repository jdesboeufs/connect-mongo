
/**
 * Module dependencies.
 */

var MongoStore = require('connect-mongo');
var should = require('should');

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

var cleanup = function(store, db, collection) {
  collection.drop(function(err, result) {
    db.close();
    store.db.close();
  });
};

exports.test_set = function(done) {
  open_db(function(store, db, collection) {
    var sid = 'test_set-sid';
    store.set(sid, {foo:'bar'}, function(err, session) {
      should.strictEqual(null, err);
      session.should.eql({foo: 'bar'});

      // Verify it was saved
      collection.findOne({_id: sid}, function(err, session) {
        session.should.eql({foo: 'bar', _id: sid});
        cleanup(store, db, collection);
        done();
      });  
    });
  });
};

exports.test_get = function(done) {
  open_db(function(store, db, collection) {
    var sid = 'test_get-sid';
    collection.insert({_id: sid, key1: 1, key2: 'two'}, function(error, ids) {
      store.get(sid, function(err, session) {
        session.should.eql({key1: 1, key2: 'two'});
        cleanup(store, db, collection);
        done();
      });
    });
  });
};

exports.test_length = function(done) {
  open_db(function(store, db, collection) {
    var sid = 'test_length-sid';
    collection.insert({_id: sid, key1: 1, key2: 'two'}, function(error, ids) {
      store.length(function(err, length) {
        length.should.equal(1);
        cleanup(store, db, collection);
        done();
      });
    });
  });
};

exports.test_destroy_ok = function(done) {
  open_db(function(store, db, collection) {
    var sid = 'test_destroy_ok-sid';
    collection.insert({_id: sid, key1: 1, key2: 'two'}, function(error, ids) {
      store.destroy(sid, function(err, result) {
        should.strictEqual(null, err);
        result.should.be.ok;
        cleanup(store, db, collection);
        done();
      });
    });
  });
};

exports.test_clear = function(done) {
  open_db(function(store, db, collection) {
    var sid = 'test_length-sid';
    collection.insert({_id: sid, key1: 1, key2: 'two'}, function(error, ids) {
      store.clear(function(err, result) {        
        result.should.be.true;
        cleanup(store, db, collection);
        done();
      });
    });
  });
};