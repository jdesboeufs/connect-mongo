
/**
 * Module dependencies.
 */

var MongoStore = require('connect-mongo');
var should = require('should');

var options = {db: 'connect-mongo-test'};
var mongo = require('mongodb');

exports.test_set = function(done) {
  var store = new MongoStore(options, function() {
    var db = new mongo.Db(options.db, new mongo.Server('127.0.0.1', 27017, {}));

    db.open(function(err) {
      db.collection('sessions', function(err, collection) {          
        // Test set
        var sid = 'test-sid';
        store.set(sid, {foo:'bar'}, function(err, session) {
          should.strictEqual(null, err);
          session.should.eql({foo: 'bar', _id:sid});
          
          
          collection.findOne({_id: sid}, function(err, session) {
            //session.should.eql({foo: 'bar', _id: sid});

            db.close();
            store.db.close();
            done();
          });
        });
      });
    });
  });
};

exports.test_get = function(done) {
  done();
};