'use strict';
/* eslint indent: [error, 4] */

const Promise = require('bluebird');
const MongoClient = require('mongodb');

function defaultSerializeFunction(session) {
    // Copy each property of the session to a new object
    const obj = {};
    let prop;

    for (prop in session) {
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

function computeTransformFunctions(options, defaultStringify) {
    if (options.serialize || options.unserialize) {
        return {
            serialize: options.serialize || defaultSerializeFunction,
            unserialize: options.unserialize || (x => x),
        };
    }

    if (options.stringify === false || defaultStringify === false) {
        return {
            serialize: defaultSerializeFunction,
            unserialize: x => x,
        };
    }

    if (options.stringify === true || defaultStringify === true) {
        return {
            serialize: JSON.stringify,
            unserialize: JSON.parse,
        };
    }
}

module.exports = function connectMongo(connect) {
    const Store = connect.Store || connect.session.Store;
    const MemoryStore = connect.MemoryStore || connect.session.MemoryStore;

    class MongoStore extends Store {

        constructor(options) {
            options = options || {};

            /* Fallback */
            if (options.fallbackMemory && MemoryStore) {
                return new MemoryStore();
            }

            super(options);

            /* Options */
            this.ttl = options.ttl || 1209600; // 14 days
            this.collectionName = options.collection || 'sessions';
            this.autoRemove = options.autoRemove || 'native';
            this.autoRemoveInterval = options.autoRemoveInterval || 10;
            this.transformFunctions = computeTransformFunctions(options, true);

            this.options = options;

            this.changeState('init');

            const newConnectionCallback = (err, db) => {
                if (err) {
                    this.connectionFailed(err);
                } else {
                    this.handleNewConnectionAsync(db);
                }
            };

            if (options.url) {
                // New native connection using url + mongoOptions
                MongoClient.connect(options.url, options.mongoOptions || {}, newConnectionCallback);
            } else if (options.mongooseConnection) {
                // Re-use existing or upcoming mongoose connection
                if (options.mongooseConnection.readyState === 1) {
                    this.handleNewConnectionAsync(options.mongooseConnection.db);
                } else {
                    options.mongooseConnection.once('open', () => this.handleNewConnectionAsync(options.mongooseConnection.db));
                }
            } else if (options.db && options.db.listCollections) {
                // Re-use existing or upcoming native connection
                if (options.db.openCalled || options.db.openCalled === undefined) { // openCalled is undefined in mongodb@2.x
                    this.handleNewConnectionAsync(options.db);
                } else {
                    options.db.open(newConnectionCallback);
                }
            } else if (options.dbPromise) {
                options.dbPromise
                    .then(db => this.handleNewConnectionAsync(db))
                    .catch(err => this.connectionFailed(err));
            } else {
                throw new Error('Connection strategy not found');
            }

            this.changeState('connecting');

        }

        connectionFailed(err) {
            this.changeState('disconnected');
            throw err;
        }

        handleNewConnectionAsync(db) {
            this.db = db;
            return this
                .setCollection(db.collection(this.collectionName))
                .setAutoRemoveAsync()
                    .then(() => this.changeState('connected'));
        }

        setAutoRemoveAsync() {
            let removeQuery = { expires: { $lt: new Date() } };
            switch (this.autoRemove) {
            case 'native':
                return this.collection.ensureIndexAsync({ expires: 1 }, { expireAfterSeconds: 0 });
            case 'interval':
                this.timer = setInterval(() => this.collection.remove(removeQuery, { w: 0 }), this.autoRemoveInterval * 1000 * 60);
                this.timer.unref();
                return Promise.resolve();
            default:
                return Promise.resolve();
            }
        }

        changeState(newState) {
            if (newState !== this.state) {
                this.state = newState;
                this.emit(newState);
            }
        }

        setCollection(collection) {
            if (this.timer) {
                clearInterval(this.timer);
            }
            this.collectionReadyPromise = undefined;
            this.collection = collection;

            // Promisify used collection methods
            ['count', 'findOne', 'remove', 'drop', 'ensureIndex'].forEach(method => {
                collection[method + 'Async'] = Promise.promisify(collection[method], { context: collection });
            });
            collection.updateAsync = Promise.promisify(collection.update, { context: collection, multiArgs: true });

            return this;
        }

        collectionReady() {
            let promise = this.collectionReadyPromise;
            if (!promise) {
                promise = new Promise((resolve, reject) => {
                    switch (this.state) {
                    case 'connected':
                        resolve(this.collection);
                        break;
                    case 'connecting':
                        this.once('connected', () => resolve(this.collection));
                        break;
                    case 'disconnected':
                        reject(new Error('Not connected'));
                        break;
                    }
                });
                this.collectionReadyPromise = promise;
            }
            return promise;
        }

        computeStorageId(sessionId) {
            if (this.options.transformId && typeof this.options.transformId === 'function') {
                return this.options.transformId(sessionId);
            } else {
                return sessionId;
            }
        }

        /* Public API */

        get(sid, callback) {
            return this.collectionReady()
                .then(collection => collection.findOneAsync({
                    _id: this.computeStorageId(sid),
                    $or: [
                        { expires: { $exists: false } },
                        { expires: { $gt: new Date() } },
                    ],
                }))
                .then(session => {
                    if (session) {
                        const s = this.transformFunctions.unserialize(session.session);
                        if (this.options.touchAfter > 0 && session.lastModified) {
                            s.lastModified = session.lastModified;
                        }
                        this.emit('get', sid);
                        return s;
                    }
                })
                .asCallback(callback);
        }

        set(sid, session, callback) {

            // removing the lastModified prop from the session object before update
            if (this.options.touchAfter > 0 && session && session.lastModified) {
                delete session.lastModified;
            }

            let s;

            try {
                s = { _id: this.computeStorageId(sid), session: this.transformFunctions.serialize(session) };
            } catch (err) {
                return callback(err);
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
                s.expires = new Date(Date.now() + this.ttl * 1000);
            }

            if (this.options.touchAfter > 0) {
                s.lastModified = new Date();
            }

            return this.collectionReady()
                .then(collection => collection.updateAsync({ _id: this.computeStorageId(sid) }, s, { upsert: true }))
                .then(responseArray => {
                    const rawResponse = responseArray.length === 2 ? responseArray[1] : responseArray[0].result;
                    if (rawResponse && rawResponse.upserted) {
                        this.emit('create', sid);
                    } else {
                        this.emit('update', sid);
                    }
                    this.emit('set', sid);
                })
                .asCallback(callback);
        }

        touch(sid, session, callback) {
            const updateFields = {},
                touchAfter = this.options.touchAfter * 1000,
                lastModified = session.lastModified ? session.lastModified.getTime() : 0,
                currentDate = new Date();

            // if the given options has a touchAfter property, check if the
            // current timestamp - lastModified timestamp is bigger than
            // the specified, if it's not, don't touch the session
            if (touchAfter > 0 && lastModified > 0) {

                const timeElapsed = currentDate.getTime() - session.lastModified;

                if (timeElapsed < touchAfter) {
                    return callback();
                } else {
                    updateFields.lastModified = currentDate;
                }

            }

            if (session && session.cookie && session.cookie.expires) {
                updateFields.expires = new Date(session.cookie.expires);
            } else {
                updateFields.expires = new Date(Date.now() + this.ttl * 1000);
            }

            return this.collectionReady()
                .then(collection => collection.updateAsync({ _id: this.computeStorageId(sid) }, { $set: updateFields }))
                .then(result => {
                    if (result.nModified === 0) {
                        throw new Error('Unable to find the session to touch');
                    } else {
                        this.emit('touch', sid);
                    }
                })
                .asCallback(callback);
        }

        destroy(sid, callback) {
            if (Array.isArray(sid)) {
                let ids = sid.map(function (s) {
                    return this.computeStorageId(s);
                });
                let self = this;
                return this.collectionReady()
                    .then(collection => collection.removeAsync({ _id: { $in: ids } }))
                    .then(function () {
                        sid.forEach(function (s) {
                            self.emit('destroy', s);
                        });
                    })
                    .asCallback(callback);
            } else {
                return this.collectionReady()
                    .then(collection => collection.removeAsync({ _id: this.computeStorageId(sid) }))
                    .then(() => this.emit('destroy', sid))
                    .asCallback(callback);
            }
        }

        length(callback) {
            return this.collectionReady()
                .then(collection => collection.countAsync({}))
                .asCallback(callback);
        }

        clear(callback) {
            return this.collectionReady()
                .then(collection => collection.dropAsync())
                .asCallback(callback);
        }

        close() {
            if (this.db) {
                this.db.close();
            }
        }
    }

    return MongoStore;
};
