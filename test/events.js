'use strict';

const expect = require('expect.js');

const expressSession = require('express-session');
const MongoStore = require('../')(expressSession);
const futureDate = new Date(2030, 1);

const connectionString = process.env.MONGODB_URL || 'mongodb://localhost/connect-mongo-test';

function noop() {}

describe('Events', () => {
  let store, collection;
  beforeEach(done => {
    store = new MongoStore({
      url: connectionString,
      collection: 'sessions-test',
    });
    store.once('connected', () => {
      collection = store.collection;
      collection.remove({}, done);
    });
  });

  describe('set() with an unknown session id', () => {
    it('should emit a `create` event', done => {
      store.once('create', sid => {
        expect(sid).to.be('foo1');
        done();
      });
      store.set('foo1', { foo: 'bar' }, noop);
    });
    it('should emit a `set` event', done => {
      store.once('set', sid => {
        expect(sid).to.be('foo2');
        done();
      });
      store.set('foo2', { foo: 'bar' }, noop);
    });
  });

  describe('set() with a session id associated to an existing session', () => {
    it('should emit an `update` event', done => {
      store.once('update', sid => {
        expect(sid).to.be('foo3');
        done();
      });
      collection.insert({ _id: 'foo3', session: { foo: 'bar1' }, expires: futureDate }, err => {
        expect(err).not.to.be.ok();
        store.set('foo3', { foo: 'bar2' }, noop);
      });
    });
    it('should emit an `set` event', done => {
      store.once('update', sid => {
        expect(sid).to.be('foo4');
        done();
      });
      collection.insert({ _id: 'foo4', session: { foo: 'bar1' }, expires: futureDate }, err => {
        expect(err).not.to.be.ok();
        store.set('foo4', { foo: 'bar2' }, noop);
      });
    });
  });

});
