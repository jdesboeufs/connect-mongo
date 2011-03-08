
/**
 * Module dependencies.
 */

var MongoStore = require('connect-mongo');
var should = require('should');

var options = {db: 'connect-mongo-test'};
var mongo = require('mongodb');

exports.test_set_get_length_destroy_clear = function(done) {
  var store = new MongoStore(options, function() {
    var db = new mongo.Db(options.db, new mongo.Server('127.0.0.1', 27017, {}));

    db.open(function(err) {
      
      
      db.collection('sessions', function(err, collection) {          
        // Test set
        var sid = 'test-sid';
        store.set(sid, {foo:'bar'}, function(err, session) {
          should.strictEqual(null, err);
          session.should.eql({foo: 'bar'});
          
          collection.findOne({_id: sid}, function(err, session) {
            session.should.eql({foo: 'bar', _id: sid});

            // Test get
            store.get(sid, function(err, session) {
              should.strictEqual(null, err);
              session.should.eql({foo: 'bar'});

              // Test length
              store.length(function(err, length) {
                length.should.equal(1);

                // Test destroy
                store.destroy(sid, function(err, result) { 
                  result.should.be.ok;
                  
                  // Test clear
                  store.clear(function(err, result) {
                    result.should.be.ok;
                    
                    db.close();
                    store.db.close();
                    done();
                  });
                });
              });
            });
          });
        });
      });
    });
  });
};