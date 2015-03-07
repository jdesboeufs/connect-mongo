/* jshint camelcase: false */

/**
 * Module dependencies
 */
var _ = require('lodash');
var crypto = require('crypto');
var mongo = require('mongodb');
var util = require('util');
var debug = require('debug')('connect-mongo');
var deprecate = require('depd')('connect-mongo');

var MongoClient = mongo.MongoClient;
var Db = mongo.Db;


/**
 * Default options
 */
var defaultOptions = {
  // Legacy strategy default options
  host: '127.0.0.1',
  port: 27017,
  autoReconnect: true,
  ssl: false,
  w: 1,

  // Global options
  collection: 'sessions',
  stringify: true,
  hash: false,
  ttl:  60 * 60 * 24 * 14, // 14 days
  autoRemove: 'native',
  autoRemoveInterval: 10
};

var defaultHashOptions = {
  salt: 'connect-mongo',
  algorithm: 'sha1'
};

var defaultSerializationOptions = {
  serialize: function (session) {
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
  },
  unserialize: _.identity
};

var stringifySerializationOptions = {
  serialize: JSON.stringify,
  unserialize: JSON.parse
};

module.exports = function(connect) {
  var Store = connect.Store || connect.session.Store;
  var MemoryStore = connect.MemoryStore || connect.session.MemoryStore;

  /**
   * Initialize MongoStore with the given `options`.
   *
   * @param {Object} options
   * @api public
   */

  function MongoStore(options) {

    /* Deprecated options */

    if ('auto_reconnect' in options) {
      deprecate('auto_reconnect option is deprecated. Use autoReconnect instead');
      options.autoReconnect = options.auto_reconnect;
    }

    if ('mongoose_connection' in options) {
      deprecate('mongoose_connection option is deprecated. Use mongooseConnection instead');
      options.mongooseConnection = options.mongoose_connection;
    }

    if ('defaultExpirationTime' in options) {
      deprecate('defaultExpirationTime option is deprecated. Use ttl instead');
      options.ttl = options.defaultExpirationTime / 1000;
    }

    /* Fallback */

    if (options.fallbackMemory && MemoryStore) {
      return new MemoryStore();
    }

    /* Options */

    options = _.defaults(options || {}, defaultOptions);

    if (options.hash) {
      options.hash = _.defaults(options.hash, defaultHashOptions);
    }

    if (!options.stringify || options.serialize || options.unserialize) {
      options = _.defaults(options, defaultSerializationOptions);
    } else {
      options = _.assign(options, stringifySerializationOptions);
    }

    this.options =  options;

    Store.call(this, options);

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

      self.collection = self.db.collection(options.collection);

      switch (options.autoRemove) {

        case 'native':
          self.collection.ensureIndex({ expires: 1 }, { expireAfterSeconds: 0 }, function (err) {
            if (err) throw err;
            changeState('connected');
          });
          break;

        case 'interval':
          setInterval(function () {
            self.collection.remove({ expires: { $lt: new Date() } }, { w: 0 });
          }, options.autoRemoveInterval * 1000 * 60);
          changeState('connected');
          break;

        default:
          changeState('connected');
          break;

      }
    }

    function buildUrlFromOptions() {
      if(!options.db || typeof options.db !== 'string') {
        throw new Error('Required MongoStore option `db` missing or is not a string.');
      }

      options.url = 'mongodb://';

      if (options.username) {
        options.url += options.username + ':' + (options.password || '') + '@';
      }

      options.url += options.host + ':' + options.port + '/' + options.db;

      if (options.ssl) options.url += '?ssl=true';

      if (!options.mongoOptions) {
        options.mongoOptions = {
          server: { auto_reconnect: options.autoReconnect },
          db: { w: options.w }
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
      if (options.mongooseConnection.readyState === 1) {
        self.db = options.mongooseConnection.db;
        process.nextTick(connectionReady);
      } else {
        options.mongooseConnection.once('open', function() {
          self.db = options.mongooseConnection.db;
          connectionReady();
        });
      }
    }

    function initWithNativeDb() {
      self.db = options.db;

      if (options.db.openCalled) {
        options.db.collection(options.collection, connectionReady);
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

    this.getSessionId = function (sid) {
      if (options.hash) {
        return crypto.createHash(options.hash.algorithm).update(options.hash.salt + sid).digest('hex');
      } else {
        return sid;
      }
    };

    changeState('init');

    if (options.url) {
      debug('use strategy: `url`');
      initWithUrl();
    } else if (options.mongooseConnection) {
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
    if (!callback) callback = _.noop;
    sid = this.getSessionId(sid);

    var self = this;

    var query = {
      _id: sid,
      $or: [
        { expires: { $exists: false } },
        { expires: { $gt: new Date() } }
      ]
    };

    this.getCollection(function(err, collection) {
      if (err) return callback(err);
      collection.findOne(query, function(err, session) {
        if (err) {
          debug('not able to execute `find` query for session: ' + sid);
          return callback(err);
        }

        if (session) {
          var s;
          try {
            s = self.options.unserialize(session.session);
            if(self.options.touchAfter > 0 && session.lastModified){
              s.lastModified = session.lastModified;
            }
          } catch (err) {
            debug('unable to deserialize session');
            callback(err);
          }
          callback(null, s);
        } else {
          callback();
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
    if (!callback) callback = _.noop;
    sid = this.getSessionId(sid);

    // removing the lastModified prop from the session object before update
    if(this.options.touchAfter > 0 && session && session.lastModified){
      delete session.lastModified;
    }

    var s;

    try {
      s = {_id: sid, session: this.options.serialize(session)};
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
      s.expires = new Date(Date.now() + this.options.ttl * 1000);
    }

    if(this.options.touchAfter > 0){
      s.lastModified = new Date();
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
   * Touch the given `sess` object associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Session} session
   * @param {Function} callback
   * @api public
   */
  MongoStore.prototype.touch = function (sid, session, callback) {

    var updateFields = {},
      touchAfter = this.options.touchAfter * 1000,
      lastModified = session.lastModified ? session.lastModified.getTime() : 0,
      currentDate = new Date();

    sid = this.getSessionId(sid);

    callback = callback ? callback : _.noop;

    // if the given options has a touchAfter property, check if the
    // current timestamp - lastModified timestamp is bigger than 
    // the specified, if it's not, don't touch the session
    if(touchAfter > 0 && lastModified > 0){

      var timeElapsed = currentDate.getTime() - session.lastModified;

      if(timeElapsed < touchAfter){
        return callback();
      } else {
        updateFields.lastModified = currentDate;
      }

    }

    if (session && session.cookie && session.cookie.expires) {
      updateFields.expires = new Date(session.cookie.expires);
    } else {
      updateFields.expires = new Date(Date.now() + this.options.ttl * 1000);
    }

    this.getCollection(function(err, collection) {
      if (err) return callback(err);
      collection.update({ _id: sid }, { $set: updateFields }, { safe: true }, function (err, result) {
        if (err) {
          debug('not able to touch session: %s (error)', sid);
          callback(err);
        } else if (result.nModified === 0) {
          debug('not able to touch session: %s (not found)', sid);
          callback(new Error('Unable to find the session to touch'));
        }
        callback();
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
    if (!callback) callback = _.noop;
    sid = this.getSessionId(sid);

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
    if (!callback) callback = _.noop;
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
    if (!callback) callback = _.noop;
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
