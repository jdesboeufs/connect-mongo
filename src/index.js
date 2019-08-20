'use strict'

const MongoClient = require('mongodb')
const { mergeMongoOptions } = require('./helper')

function withCallback(promise, cb) {
  // Assume that cb is a function - type checks and handling type errors
  // can be done by caller
  if (cb) {
    promise.then(res => cb(null, res)).catch(cb)
  }
  return promise
}

function defaultSerializeFunction(session) {
  // Copy each property of the session to a new object
  const obj = {}
  let prop

  for (prop in session) {
    if (prop === 'cookie') {
      // Convert the cookie instance to an object, if possible
      // This gets rid of the duplicate object under session.cookie.data property
      obj.cookie = session.cookie.toJSON
        ? session.cookie.toJSON()
        : session.cookie
    } else {
      obj[prop] = session[prop]
    }
  }

  return obj
}

function computeTransformFunctions(options) {
  if (options.serialize || options.unserialize) {
    return {
      serialize: options.serialize || defaultSerializeFunction,
      unserialize: options.unserialize || (x => x),
    }
  }

  if (options.stringify === false) {
    return {
      serialize: defaultSerializeFunction,
      unserialize: x => x,
    }
  }
  // Default case
  return {
    serialize: JSON.stringify,
    unserialize: JSON.parse,
  }
}

module.exports = function(connect) {
  const Store = connect.Store || connect.session.Store
  const MemoryStore = connect.MemoryStore || connect.session.MemoryStore

  class MongoStore extends Store {
    constructor(options) {
      options = options || {}

      /* Fallback */
      if (options.fallbackMemory && MemoryStore) {
        return new MemoryStore()
      }

      super(options)

      /* Use crypto? */
      if (options.secret) {
        try {
          this.Crypto = require('./crypto.js')
          this.Crypto.init(options)
          delete options.secret
        } catch (error) {
          throw error
        }
      }

      /* Options */
      this.ttl = options.ttl || 1209600 // 14 days
      this.collectionName = options.collection || 'sessions'
      this.autoRemove = options.autoRemove || 'native'
      this.autoRemoveInterval = options.autoRemoveInterval || 10 // Minutes
      this.writeOperationOptions = options.writeOperationOptions || {}
      this.transformFunctions = computeTransformFunctions(options)
      this.options = options

      this.changeState('init')

      const newConnectionCallback = (err, client) => {
        if (err) {
          this.connectionFailed(err)
        } else {
          this.handleNewConnectionAsync(client)
        }
      }

      if (options.url) {
        // New native connection using url + mongoOptions
        const _mongoOptions = mergeMongoOptions(options.mongoOptions)
        MongoClient.connect(options.url, _mongoOptions, newConnectionCallback)
      } else if (options.mongooseConnection) {
        // Re-use existing or upcoming mongoose connection
        if (options.mongooseConnection.readyState === 1) {
          this.handleNewConnectionAsync(options.mongooseConnection)
        } else {
          options.mongooseConnection.once('open', () =>
            this.handleNewConnectionAsync(options.mongooseConnection)
          )
        }
      } else if (options.client) {
        if (options.client.isConnected()) {
          this.handleNewConnectionAsync(options.client)
        } else {
          options.client.once('open', () =>
            this.handleNewConnectionAsync(options.client)
          )
        }
      } else if (options.clientPromise) {
        options.clientPromise
          .then(client => this.handleNewConnectionAsync(client))
          .catch(err => this.connectionFailed(err))
      } else {
        throw new Error('Connection strategy not found')
      }

      this.changeState('connecting')
    }

    connectionFailed(err) {
      this.changeState('disconnected')
      throw err
    }

    handleNewConnectionAsync(client) {
      this.client = client
      this.db = typeof client.db !== 'function' ? client.db : client.db()
      return this.setCollection(this.db.collection(this.collectionName))
        .setAutoRemoveAsync()
        .then(() => this.changeState('connected'))
    }

    setAutoRemoveAsync() {
      const removeQuery = () => {
        return { expires: { $lt: new Date() } }
      }
      switch (this.autoRemove) {
        case 'native':
          return this.collection.createIndex(
            { expires: 1 },
            Object.assign({ expireAfterSeconds: 0 }, this.writeOperationOptions)
          )
        case 'interval':
          this.timer = setInterval(
            () =>
              this.collection.deleteMany(
                removeQuery(),
                Object.assign({}, this.writeOperationOptions, {
                  w: 0,
                  j: false,
                })
              ),
            this.autoRemoveInterval * 1000 * 60
          )
          this.timer.unref()
          return Promise.resolve()
        default:
          return Promise.resolve()
      }
    }

    changeState(newState) {
      if (newState !== this.state) {
        this.state = newState
        this.emit(newState)
      }
    }

    setCollection(collection) {
      if (this.timer) {
        clearInterval(this.timer)
      }
      this.collectionReadyPromise = undefined
      this.collection = collection

      return this
    }

    collectionReady() {
      let promise = this.collectionReadyPromise
      if (!promise) {
        promise = new Promise((resolve, reject) => {
          if (this.state === 'connected') {
            return resolve(this.collection)
          }
          if (this.state === 'connecting') {
            return this.once('connected', () => resolve(this.collection))
          }
          reject(new Error('Not connected'))
        })
        this.collectionReadyPromise = promise
      }
      return promise
    }

    computeStorageId(sessionId) {
      if (
        this.options.transformId &&
        typeof this.options.transformId === 'function'
      ) {
        return this.options.transformId(sessionId)
      }
      return sessionId
    }

    /* Public API */

    get(sid, callback) {
      return withCallback(
        this.collectionReady()
          .then(collection =>
            collection.findOne({
              _id: this.computeStorageId(sid),
              $or: [
                { expires: { $exists: false } },
                { expires: { $gt: new Date() } },
              ],
            })
          )
          .then(session => {
            if (session) {
              if (this.Crypto) {
                const tmpSession = this.transformFunctions.unserialize(
                  session.session
                )
                session.session = this.Crypto.get(tmpSession)
              }
              const s = this.transformFunctions.unserialize(session.session)
              if (this.options.touchAfter > 0 && session.lastModified) {
                s.lastModified = session.lastModified
              }
              this.emit('get', sid)
              return s
            }
          }),
        callback
      )
    }

    set(sid, session, callback) {
      // Removing the lastModified prop from the session object before update
      if (this.options.touchAfter > 0 && session && session.lastModified) {
        delete session.lastModified
      }

      let s

      if (this.Crypto) {
        try {
          session = this.Crypto.set(session)
        } catch (error) {
          return withCallback(Promise.reject(error), callback)
        }
      }

      try {
        s = {
          _id: this.computeStorageId(sid),
          session: this.transformFunctions.serialize(session),
        }
      } catch (err) {
        return withCallback(Promise.reject(err), callback)
      }

      if (session && session.cookie && session.cookie.expires) {
        s.expires = new Date(session.cookie.expires)
      } else {
        // If there's no expiration date specified, it is
        // browser-session cookie or there is no cookie at all,
        // as per the connect docs.
        //
        // So we set the expiration to two-weeks from now
        // - as is common practice in the industry (e.g Django) -
        // or the default specified in the options.
        s.expires = new Date(Date.now() + this.ttl * 1000)
      }

      if (this.options.touchAfter > 0) {
        s.lastModified = new Date()
      }

      return withCallback(
        this.collectionReady()
          .then(collection =>
            collection.updateOne(
              { _id: this.computeStorageId(sid) },
              { $set: s },
              Object.assign({ upsert: true }, this.writeOperationOptions)
            )
          )
          .then(rawResponse => {
            if (rawResponse.result) {
              rawResponse = rawResponse.result
            }
            if (rawResponse && rawResponse.upserted) {
              this.emit('create', sid)
            } else {
              this.emit('update', sid)
            }
            this.emit('set', sid)
          }),
        callback
      )
    }

    touch(sid, session, callback) {
      const updateFields = {}
      const touchAfter = this.options.touchAfter * 1000
      const lastModified = session.lastModified
        ? session.lastModified.getTime()
        : 0
      const currentDate = new Date()

      // If the given options has a touchAfter property, check if the
      // current timestamp - lastModified timestamp is bigger than
      // the specified, if it's not, don't touch the session
      if (touchAfter > 0 && lastModified > 0) {
        const timeElapsed = currentDate.getTime() - session.lastModified

        if (timeElapsed < touchAfter) {
          return withCallback(Promise.resolve(), callback)
        }
        updateFields.lastModified = currentDate
      }

      if (session && session.cookie && session.cookie.expires) {
        updateFields.expires = new Date(session.cookie.expires)
      } else {
        updateFields.expires = new Date(Date.now() + this.ttl * 1000)
      }

      return withCallback(
        this.collectionReady()
          .then(collection =>
            collection.updateOne(
              { _id: this.computeStorageId(sid) },
              { $set: updateFields },
              this.writeOperationOptions
            )
          )
          .then(result => {
            if (result.nModified === 0) {
              throw new Error('Unable to find the session to touch')
            } else {
              this.emit('touch', sid, session)
            }
          }),
        callback
      )
    }

    all(callback) {
      return withCallback(
        this.collectionReady()
          .then(collection =>
            collection.find({
              $or: [
                { expires: { $exists: false } },
                { expires: { $gt: new Date() } },
              ],
            })
          )
          .then(sessions => {
            return new Promise((resolve, reject) => {
              const results = []
              sessions.forEach(
                session =>
                  results.push(
                    this.transformFunctions.unserialize(session.session)
                  ),
                err => {
                  if (err) {
                    reject(err)
                  }
                  this.emit('all', results)
                  resolve(results)
                }
              )
            })
          }),
        callback
      )
    }

    destroy(sid, callback) {
      return withCallback(
        this.collectionReady()
          .then(collection =>
            collection.deleteOne(
              { _id: this.computeStorageId(sid) },
              this.writeOperationOptions
            )
          )
          .then(() => this.emit('destroy', sid)),
        callback
      )
    }

    length(callback) {
      return withCallback(
        this.collectionReady().then(collection =>
          collection.countDocuments({})
        ),
        callback
      )
    }

    clear(callback) {
      return withCallback(
        this.collectionReady().then(collection =>
          collection.drop(this.writeOperationOptions)
        ),
        callback
      )
    }

    close() {
      if (this.client) {
        return this.client.close()
      }
    }
  }

  return MongoStore
}
