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
    test('dbName should be set to databaseName w/ url', done => {
      store = new MongoStore({
        url: connectionString,
        dbName,
      })
      store.once('connected', () => {
        expect(store.db.databaseName).toEqual(dbName)
        done()
      })
    })

    test('dbName should be set to databaseName w/ client', done => {
      MongoClient.connect(connectionString, mongoOptions, (err, client) => {
        expect(err).toBeFalsy()
        store = new MongoStore({
          client,
          dbName,
        })
        store.once('connected', () => {
          expect(store.db.databaseName).toEqual(dbName)
          done()
        })
      })
    })

    test('dbName should be set to databaseName w/ clientPromise', done => {
      const clientPromise = MongoClient.connect(connectionString, mongoOptions)
      store = new MongoStore({
        clientPromise,
        dbName,
      })
      store.once('connected', () => {
        expect(store.db.databaseName).toEqual(dbName)
        done()
      })
    })
  })
})
