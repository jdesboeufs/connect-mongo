'use strict'

const expressSession = require('express-session')
const MongoClient = require('mongodb')
const MongoStore = require('..')(expressSession)

const connectionString =
  process.env.MONGODB_URL || 'mongodb://localhost:27017/connect-mongo-test'

const mongoOptions = { useNewUrlParser: true }

describe('Validate options', () => {
  let store
  afterEach(() => {
    return store.close()
  })

  describe('dbName option', () => {
    const dbName = 'dbName-test'
    test('dbName should be set to databaseName w/ url', () => {
      return new Promise((resolve) => {
        store = new MongoStore({
          url: connectionString,
          dbName,
        })
        store.once('connected', () => {
          expect(store.db.databaseName).toEqual(dbName)
          resolve()
        })
      })
    })

    test('dbName should be set to databaseName w/ client', () => {
      return new Promise((resolve) => {
        MongoClient.connect(connectionString, mongoOptions, (err, client) => {
          expect(err).toBeFalsy()
          store = new MongoStore({
            client,
            dbName,
          })
          store.once('connected', () => {
            expect(store.db.databaseName).toEqual(dbName)
            resolve()
          })
        })
      })
    })

    test('dbName should be set to databaseName w/ clientPromise', () => {
      return new Promise((resolve) => {
        const clientPromise = MongoClient.connect(
          connectionString,
          mongoOptions
        )
        store = new MongoStore({
          clientPromise,
          dbName,
        })
        store.once('connected', () => {
          expect(store.db.databaseName).toEqual(dbName)
          resolve()
        })
      })
    })
  })

  describe('autoRemoveInterval', () => {
    test('not providoing autoRemoveInterval', () => {
      return new Promise((resolve) => {
        const dbName = 'dbName-test'
        const clientPromise = MongoClient.connect(
          connectionString,
          mongoOptions
        )
        store = new MongoStore({
          clientPromise,
          dbName,
          autoRemove: 'interval',
        })
        store.once('connected', () => {
          expect(store.db.databaseName).toEqual(dbName)
          resolve()
        })
      })
    })

    test('should throw error when autoRemoveInterval is too large', () => {
      const dbName = 'dbName-test'
      const clientPromise = MongoClient.connect(connectionString, mongoOptions)
      expect(() => {
        store = new MongoStore({
          clientPromise,
          dbName,
          autoRemove: 'interval',
          autoRemoveInterval: 71583,
        })
      }).toThrowErrorMatchingSnapshot()
    })
  })
})
