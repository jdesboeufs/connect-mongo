/*!
 * connect-mongo
 * Copyright(c) 2011 Casey Banner <kcbanner@gmail.com>
 * MIT Licensed
 */

/**
 * Module dependencies
 */
var crypto = require('crypto');
var mongo = require('mongodb');
var util = require('util');
var debug = require('debug')('connect-mongo');

var MongoClient = mongo.MongoClient;
var Db = mongo.Db;


/**
 * Default options
 */
var defaultOptions = {
  host: '127.0.0.1',
  port: 27017,
  collection: 'sessions',
  auto_reconnect: true,
  ssl: false,
  w: 1,
  defaultExpirationTime:  1000 * 60 * 60 * 24 * 14 // 14 days
};

function defaultSerializer (session) {
  // Copy each property of the session to a new object
  var obj = {};
  for (var prop in session) {
    if (prop === 'cookie') {

    // Convert the cookie instance to an object, if possible
    // This gets rid of the duplicate object under session.cookie.data property

      obj.cookie = session.cookie.toJSON ? session.cookie.toJSON() : session.cookie;
    } else {
      obj[prop] = session[prop];
    }
  }

  return obj;
}

function identity (x) { return x; }

module.exports = function(connect) {
  var Store = connect.Store || connect.session.Store;

  /**
   * Initialize MongoStore with the given `options`.
   *
   * @param {Object} options
   * @api public
   */

  function MongoStore(options) {
    options = options || {};
    var collectionName = options.collection || defaultOptions.collection;

    Store.call(this, options);

    // Hash sid
    if (options.hash) {
      var defaultSalt = 'connect-mongo';
      var defaultAlgorithm = 'sha1';
      this.hash = {};
      this.hash.salt = options.hash.salt ? options.hash.salt : defaultSalt;
      this.hash.algorithm = options.hash.algorithm ? options.hash.algorithm : defaultAlgorithm;
    }

    // Serialization
    if (options.stringify || (!('stringify' in options) && !('serialize' in options) && !('unserialize' in options))) {
      this._serialize_session = JSON.stringify;
      this._unserialize_session = JSON.parse;
    } else {
      this._serialize_session = options.serialize || defaultSerializer;
      this._unserialize_session = options.unserialize || identity;
    }

    // Expiration time
    this.defaultExpirationTime = options.defaultExpirationTime || defaultOptions.defaultExpirationTime;

    var self = this;

    function changeState(newState) {
      debug('switched to state: %s', newState);
      self.state = newState;
      self.emit(newState);
    }

    function connectionReady(err) {
      if (err) {
          debug('not able to connect to the database');
          changeState('disconnected');
          throw err;
      }
      self.collection = self.db.collection(collectionName);
      self.collection.ensureIndex({ expires: 1 }, { expireAfterSeconds: 0 }, function (err) {
        if (err) throw err;
        changeState('connected');
      });
    }

    function buildUrlFromOptions() {
      if(!options.db || typeof options.db !== 'string') {
        throw new Error('Required MongoStore option `db` missing');
      }

      options.url = 'mongodb://';

      if (options.username) {
        options.url += options.username + ':' + (options.password || '') + '@';
      }

      options.url += options.host || defaultOptions.host;
      options.url += ':' + (options.port || defaultOptions.port);
      options.url += '/' + options.db;

      if (options.ssl || defaultOptions.ssl) options.url += '?ssl=true';

      if (!options.mongoOptions) {
        options.mongoOptions = {
          server: { auto_reconnect: options.auto_reconnect || defaultOptions.auto_reconnect },
          db: { w: options.w || defaultOptions.w }
        };
      }
    }

    function initWithUrl() {
      MongoClient.connect(options.url, options.mongoOptions || {}, function(err, db) {
        if (!err) self.db = db;
        connectionReady(err);
      });
    }

    function initWithMongooseConnection() {
      if (options.mongoose_connection.readyState === 1) {
        self.db = options.mongoose_connection.db;
        process.nextTick(connectionReady);
      } else {
        options.mongoose_connection.once('open', function() {
          self.db = options.mongoose_connection.db;
          connectionReady();
        });
      }
    }

    function initWithNativeDb() {
      self.db = options.db;

      if (options.db.openCalled) {
        options.db.collection(collectionName, connectionReady);
      } else {
        options.db.open(connectionReady);
      }
    }

    this.getCollection = function (done) {
      switch (self.state) {
        case 'connected':
          done(null, self.collection);
          break;
        case 'connecting':
          self.once('connected', function () {
            done(null, self.collection);
          });
          break;
        case 'disconnected':
          done(new Error('Not connected'));
          break;
      }
    };

    changeState('init');

    if (options.url) {
      debug('use strategy: `url`');
      initWithUrl();
    } else if (options.mongoose_connection) {
      debug('use strategy: `mongoose_connection`');
      initWithMongooseConnection();
    } else if (options.db && options.db instanceof Db) {
      debug('use strategy: `native_db`');
      initWithNativeDb();
    } else {
      debug('use strategy: `legacy`');
      buildUrlFromOptions();
      initWithUrl();
    }

    changeState('connecting');

  }

  /**
   * Inherit from `Store`.
   */
   util.inherits(MongoStore, Store);

  /**
   * Attempt to fetch session by the given `sid`.
   *
   * @param {String} sid
   * @param {Function} callback
   * @api public
   */

  MongoStore.prototype.get = function(sid, callback) {
    sid = this.hash ? crypto.createHash(this.hash.algorithm).update(this.hash.salt + sid).digest('hex') : sid;
    var self = this;
    this.getCollection(function(err, collection) {
      if (err) return callback(err);
      collection.findOne({_id: sid}, function(err, session) {
        if (err) {
          debug('not able to execute `find` query for session: ' + sid);
          return callback(err);
        }

        if (session) {
          if (!session.expires || Date.now() < session.expires) {
            var s;
            try {
              s = self._unserialize_session(session.session);
            } catch (err) {
              debug('unable to deserialize session');
              callback(err);
            }
            callback(null, s);
          } else {
            self.destroy(sid, callback);
          }
        }
      });
    });
  };

  /**
   * Commit the given `sess` object associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Session} sess
   * @param {Function} callback
   * @api public
   */

  MongoStore.prototype.set = function(sid, session, callback) {
    sid = this.hash ? crypto.createHash(this.hash.algorithm).update(this.hash.salt + sid).digest('hex') : sid;
    var s;
    try {
      s = {_id: sid, session: this._serialize_session(session)};
    } catch (err) {
      debug('unable to serialize session');
      callback(err);
    }

    if (session && session.cookie && session.cookie.expires) {
      s.expires = new Date(session.cookie.expires);
    } else {
      // If there's no expiration date specified, it is
      // browser-session cookie or there is no cookie at all,
      // as per the connect docs.
      //
      // So we set the expiration to two-weeks from now
      // - as is common practice in the industry (e.g Django) -
      // or the default specified in the options.
      var today = new Date();
      s.expires = new Date(today.getTime() + this.defaultExpirationTime);
    }

    this.getCollection(function(err, collection) {
      if (err) return callback(err);
      collection.update({_id: sid}, s, {upsert: true, safe: true}, function(err) {
        if (err) debug('not able to set/update session: ' + sid);
        callback(err);
      });
    });
  };

  /**
   * Destroy the session associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Function} callback
   * @api public
   */

  MongoStore.prototype.destroy = function(sid, callback) {
    sid = this.hash ? crypto.createHash(this.hash.algorithm).update(this.hash.salt + sid).digest('hex') : sid;
    this.getCollection(function(err, collection) {
      if (err) return callback(err);
      collection.remove({_id: sid}, function(err) {
        if (err) debug('not able to destroy session: ' + sid);
        callback(err);
      });
    });
  };

  /**
   * Fetch number of sessions.
   *
   * @param {Function} callback
   * @api public
   */

  MongoStore.prototype.length = function(callback) {
    this.getCollection(function(err, collection) {
      if (err) return callback(err);
      collection.count({}, function(err, count) {
        if (err) debug('not able to count sessions');
        callback(err, count);
      });
    });
  };

  /**
   * Clear all sessions.
   *
   * @param {Function} callback
   * @api public
   */

  MongoStore.prototype.clear = function(callback) {
    this.getCollection(function(err, collection) {
      if (err) return callback(err);
      collection.drop(function(err) {
        if (err) debug('not able to clear sessions');
        callback(err);
      });
    });
  };

  return MongoStore;
};
