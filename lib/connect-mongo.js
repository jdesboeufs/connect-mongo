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
var url = require('url');
var util = require('util');
var debug = require('debug')('connect-mongo');


/**
 * Default options
 */

var defaultOptions = {host: '127.0.0.1',
                      port: 27017,
                      collection: 'sessions',
                      auto_reconnect: false,
                      ssl: false,
                      w: 1,
                      defaultExpirationTime:  1000 * 60 * 60 * 24 * 14
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
   * Calls `readyCallback` when db connection is ready (mainly for testing purposes).
   *
   * @param {Object} options
   * @param {Function} readyCallback
   * @api public
   */

  function MongoStore(options, readyCallback) {
    options = options || {};
    if(options.hash){
      var defaultSalt = 'connect-mongo';
      var defaultAlgorithm = 'sha1';
      this.hash = {};
      this.hash.salt = options.hash.salt ? options.hash.salt : defaultSalt;
      this.hash.algorithm = options.hash.algorithm ? options.hash.algorithm : defaultAlgorithm;
    }
    Store.call(this, options);

    if(options.url) {
      var db_url = url.parse(options.url);

      if (db_url.port) {
        options.port = parseInt(db_url.port);
      }

      if (db_url.pathname) {
        var pathname = db_url.pathname.split('/');

        if (pathname.length >= 2 && pathname[1]) {
          options.db = pathname[1];
        }

        if (pathname.length >= 3 && pathname[2]) {
          options.collection = pathname[2];
        }
      }

      if (db_url.hostname) {
        options.host = db_url.hostname;
      }

      if (db_url.auth) {
        var auth = db_url.auth.split(':');

        if (auth.length >= 1) {
          options.username = auth[0];
        }

        if (auth.length >= 2) {
          options.password = auth[1];
        }
      }
    }

    if (options.mongoose_connection){
      if (options.mongoose_connection.user && options.mongoose_connection.pass) {
        options.username = options.mongoose_connection.user;
        options.password = options.mongoose_connection.pass;
      }

      this.db = new mongo.Db(options.mongoose_connection.db.databaseName,
                             new mongo.Server(options.mongoose_connection.db.serverConfig.host,
                                              options.mongoose_connection.db.serverConfig.port,
                                              options.mongoose_connection.db.serverConfig.options
                                             ),
                             { w: options.w || defaultOptions.w });

    } else {
      if(!options.db) {
        throw new Error('Required MongoStore option `db` missing');
      }

      if (typeof options.db === 'object') {
        this.db = options.db; // Assume it's an instantiated DB Object
      } else {

        var serverOptions = options.server || {};
        serverOptions.auto_reconnect = serverOptions.auto_reconnect || options.auto_reconnect || defaultOptions.auto_reconnect;
        serverOptions.ssl = serverOptions.ssl || options.ssl || defaultOptions.ssl;

        this.db = new mongo.Db(options.db,
                               new mongo.Server(options.host || defaultOptions.host,
                                                options.port || defaultOptions.port,
                                                serverOptions),
                               { w: options.w || defaultOptions.w });
      }
    }

    this.db_collection_name = options.collection || defaultOptions.collection;

    if (options.stringify || (!('stringify' in options) && !('serialize' in options) && !('unserialize' in options))) {
      this._serialize_session = JSON.stringify;
      this._unserialize_session = JSON.parse;
    } else {
      this._serialize_session = options.serialize || defaultSerializer;
      this._unserialize_session = options.unserialize || identity;
    }

    var self = this;

    this._get_collection = function(callback) {
      if (self.collection) {
        callback(null, self.collection);
      } else if (self.db.openCalled) {
        self.db.collection(self.db_collection_name, function(err, collection) {
          if (err) {
            debug('not able to get collection: ' + self.db_collection_name);
            return callback(err);
          } else {
            self.collection = collection;

            // Make sure we have a TTL index on "expires", so mongod will automatically
            // remove expired sessions. expireAfterSeconds is set to 0 because we want
            // mongo to remove anything expired without any additional delay.
            self.collection.ensureIndex({expires: 1}, {expireAfterSeconds: 0}, function(err) {
              if (err) {
                debug('not able to set TTL index on collection: ' + self.db_collection_name);
                return callback(err);
              }

              callback(null, self.collection);
            });
          }
        });
      } else {
        self._open_database(callback);
      }
    };

    this._open_database = function(cb){
      self.db.open(function(err, db) {
        if (err) {
          if (!(err instanceof Error)) { err = new Error(String(err)); }
          err.message = 'Error connecting to database: ' + err.message;
          debug('not able to connect to database');
          return cb(err);
        }

        if (options.username && options.password) {
          db.authenticate(options.username, options.password, function () {
            self._get_collection(cb);
          });
        } else {
          self._get_collection(cb);
        }
      });
    };

    this.defaultExpirationTime = options.defaultExpirationTime || defaultOptions.defaultExpirationTime;

    if (readyCallback) this._open_database(readyCallback);

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
    this._get_collection(function(err, collection) {
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

    this._get_collection(function(err, collection) {
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
    this._get_collection(function(err, collection) {
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
    this._get_collection(function(err, collection) {
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
    this._get_collection(function(err, collection) {
      if (err) return callback(err);
      collection.drop(function(err) {
        if (err) debug('not able to clear sessions');
        callback(err);
      });
    });
  };

  return MongoStore;
};
