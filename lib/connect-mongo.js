
/*!
 * connect-mongo
 * Copyright(c) 2011 Casey Banner <kcbanner@gmail.com>
 * MIT Licensed
 */

/**
 * Module dependencies
 */

var Store = require('connect').session.Store;
var mongo = require('mongodb');

/**
 * Default options
 */

var defaultOptions = {db: 'connect-session', host: '127.0.0.1', port: 27017, collection: 'sessions'};

/**
 * Initialize MongoStore with the given `options`.
 * Calls `callback` when db connection is ready (mainly for testing purposes).
 *
 * @param {Object} options
 * @param {Function} callback
 * @api public
 */

var MongoStore = module.exports = function MongoStore(options, callback) {
  options = options || {};
  Store.call(this, options);

  if(!options.db) {
    throw new Error('Required MongoStore option `db` missing');
  }
  
  var self = this;
  var getCollection = function(callback) {
    self.db.collection(options.collection || defaultOptions.collection, function(err, collection) {
      if (err) {
        throw new Error('Error getting collection: ' + options.collection || defaultOptions.collection);
      }
      
      self.collection = collection;
      callback && callback();
    });
  };
  
  this.db = new mongo.Db(options.db || defaultOptions.db, new mongo.Server(options.host || defaultOptions.host,
                                                                           options.port || defaultOptions.port, {}));
  this.db.open(function(err) {
    if (err) {
      throw new Error('Error connecting to db');
    }
    
    if (options.username && options.password) {
      db.authenticate(options.username, options.password, function () {
        getCollection(callback);
      });
    } else {
      getCollection(callback);
    }
  });
};

/**
 * Inherit from `Store`.
 */

MongoStore.prototype.__proto__ = Store.prototype;

/**
 * Commit the given `sess` object associated with the given `sid`.
 *
 * @param {String} sid
 * @param {Session} sess
 * @param {Function} fn
 * @api public
 */

MongoStore.prototype.set = function(sid, session, callback) {
  try {
    session._id = sid;
    this.collection.update({_id: sid}, session, {upsert: true}, function(err, data) {
      callback && callback.apply(this, arguments);
    });
  } catch (err) {
    callback && callback(err);
  }
};

/**
 * Destroy the session associated with the given `sid`.
 *
 * @param {String} sid
 * @api public
 */

MongoStore.prototype.destroy = function(sid, callback) {
  this.collection.remove({_id: sid}, callback);
};

/**
 * Fetch number of sessions.
 *
 * @param {Function} fn
 * @api public
 */

MongoStore.prototype.length = function(callback) {
  this.collection.count({}, callback);
};

/**
 * Clear all sessions.
 *
 * @param {Function} fn
 * @api public
 */

MongoStore.prototype.clear = function(callback) {
  this.collection.drop(callback);
};