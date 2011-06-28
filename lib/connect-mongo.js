
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
var url = require('url');

/**
 * Default options
 */

var defaultOptions = {host: '127.0.0.1', port: 27017, collection: 'sessions', auto_reconnect: false};

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
  
  if(options.url) {
    var db_url = url.parse(options.url);

    if (db_url.port) {
      options.port = db_url.port;
    }
    
    if (db_url.pathname != undefined) {
      var pathname = db_url.pathname.split('/');

      if (pathname.length >= 2) {
        options.db = pathname[1];
      }
      
      if (pathname.length >= 3) {
        options.collection = pathname[2];
      }
    }
    
    if (db_url.hostname != undefined) {
      options.host = db_url.hostname;
    }

    if (db_url.auth != undefined) {
      var auth = db_url.auth.split(':');

      if (auth.length >= 1) {
        options.username = auth[0];
      }
      
      if (auth.length >= 2) {
        options.password = auth[1];
      }
    }
  }
  
  if(!options.db) {
    throw new Error('Required MongoStore option `db` missing');
  }
  
  var self = this;
  var getCollection = function(collection_name, callback) {
    self.db.collection(collection_name, function(err, collection) {
      if (err) {
        throw new Error('Error getting collection: ' + collection_name);
      }
      
      self.collection = collection;
      callback && callback();
    });
  };
  
  this.db = new mongo.Db(options.db,
                         new mongo.Server(options.host || defaultOptions.host,
                                          options.port || defaultOptions.port, 
                                          {auto_reconnect: options.auto_reconnect || defaultOptions.auto_reconnect}));
  
  this.db.open(function(err, db) {
    if (err) {
      throw new Error('Error connecting to db');
    }
    
    if (options.username && options.password) {
      db.authenticate(options.username, options.password, function () {
        getCollection(options.collection || defaultOptions.collection, callback);
      });
    } else {
      getCollection(options.collection || defaultOptions.collection, callback);
    }
  });
};

/**
 * Inherit from `Store`.
 */

MongoStore.prototype.__proto__ = Store.prototype;

/**
 * Attempt to fetch session by the given `sid`.
 *
 * @param {String} sid
 * @param {Function} fn
 * @api public
 */
MongoStore.prototype.get = function(sid, callback) {
  this.collection.findOne({_id: sid}, function(err, session) {
    try {
      if (session) {
        callback(err, JSON.parse(session.session));
      } else {
        return callback();
      }
    } catch (err) {
      callback(err);
    }
  });
};

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
    var s = {_id: sid, session: JSON.stringify(session)};  
    this.collection.update({_id: sid}, s, {upsert: true, safe: true}, function(err, data) {
      if (err) {
        callback && callback(err);
      } else {
        callback && callback(null);
      }
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
  this.collection.remove({_id: sid}, function() {
    callback && callback(null);
  });
};

/**
 * Fetch number of sessions.
 *
 * @param {Function} fn
 * @api public
 */

MongoStore.prototype.length = function(callback) {
  this.collection.count({}, function(err, count) {
    if (err) {
      callback && callback(err);
    } else {
      callback && callback(null, count);
    }
  });
};

/**
 * Clear all sessions.
 *
 * @param {Function} fn
 * @api public
 */

MongoStore.prototype.clear = function(callback) {
  this.collection.drop(function() {
    callback && callback(null);
  });
};
