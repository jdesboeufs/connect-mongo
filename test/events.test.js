'use strict'

const expressSession = require('express-session')
const MongoStore = require('..')(expressSession)

const futureDate = new Date(2030, 1)

const connectionString =
  process.env.MONGODB_URL || 'mongodb://localhost:27017/connect-mongo-test'

function noop() {}

describe('Events', () => {
  let store, collection
  beforeEach(function(done) {
    store = new MongoStore({
      url: connectionString,
      mongoOptions: { useNewUrlParser: true },
      collection: 'sessions-test',
    })
    store.once('connected', () => {
      collection = store.collection
      collection.deleteMany({}, done)
    })
  })
  afterEach(() => {
    return store.close()
  })

  describe('set() with an unknown session id', () => {
    it('should emit a `create` event', done => {
      store.once('create', sid => {
        expect(sid).toBe('foo1')
        done()
      })
      store.set('foo1', { foo: 'bar' }, noop)
    })
    it('should emit a `set` event', done => {
      store.once('set', sid => {
        expect(sid).toBe('foo2')
        done()
      })
      store.set('foo2', { foo: 'bar' }, noop)
    })
  })

  describe('set() with a session id associated to an existing session', () => {
    it('should emit an `update` event', done => {
      store.once('update', sid => {
        expect(sid).toBe('foo3')
        done()
      })
      collection.insertOne(
        { _id: 'foo3', session: { foo: 'bar1' }, expires: futureDate },
        err => {
          expect(err).toBeFalsy()
          store.set('foo3', { foo: 'bar2' }, noop)
        }
      )
    })
    it('should emit an `set` event', done => {
      store.once('update', sid => {
        expect(sid).toBe('foo4')
        done()
      })
      collection.insertOne(
        { _id: 'foo4', session: { foo: 'bar1' }, expires: futureDate },
        err => {
          expect(err).toBeFalsy()
          store.set('foo4', { foo: 'bar2' }, noop)
        }
      )
    })
  })
})

describe('Events w/ Crypto', () => {
  let store, collection
  beforeEach(function(done) {
    store = new MongoStore({
      url: connectionString,
      mongoOptions: { useNewUrlParser: true },
      collection: 'sessions-test',
      secret: 'squirrel',
    })
    store.once('connected', () => {
      collection = store.collection
      collection.deleteMany({}, done)
    })
  })
  afterEach(() => {
    return store.close()
  })

  describe('set() with an unknown session id', () => {
    it('should emit a `create` event', done => {
      store.once('create', sid => {
        expect(sid).toBe('foo1')
        done()
      })
      store.set('foo1', { foo: 'bar' }, noop)
    })
    it('should emit a `set` event', done => {
      store.once('set', sid => {
        expect(sid).toBe('foo2')
        done()
      })
      store.set('foo2', { foo: 'bar' }, noop)
    })
  })

  describe('set() with a session id associated to an existing session', () => {
    it('should emit an `update` event', done => {
      store.once('update', sid => {
        expect(sid).toBe('foo3')
        done()
      })
      collection.insertOne(
        { _id: 'foo3', session: { foo: 'bar1' }, expires: futureDate },
        err => {
          expect(err).toBeFalsy()
          store.set('foo3', { foo: 'bar2' }, noop)
        }
      )
    })
    it('should emit an `set` event', done => {
      store.once('update', sid => {
        expect(sid).toBe('foo4')
        done()
      })
      collection.insertOne(
        { _id: 'foo4', session: { foo: 'bar1' }, expires: futureDate },
        err => {
          expect(err).toBeFalsy()
          store.set('foo4', { foo: 'bar2' }, noop)
        }
      )
    })
  })
})
