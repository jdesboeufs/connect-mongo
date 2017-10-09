# connect-mongo

MongoDB session store for [Connect](https://github.com/senchalabs/connect) and [Express](http://expressjs.com/)

[![npm version](https://img.shields.io/npm/v/connect-mongo.svg)](https://www.npmjs.com/package/connect-mongo)
[![downloads](https://img.shields.io/npm/dm/connect-mongo.svg)](https://www.npmjs.com/package/connect-mongo)
[![Build Status](https://travis-ci.org/jdesboeufs/connect-mongo.svg?branch=master)](https://travis-ci.org/jdesboeufs/connect-mongo)
[![Coverage Status](https://coveralls.io/repos/jdesboeufs/connect-mongo/badge.svg?branch=master&service=github)](https://coveralls.io/github/jdesboeufs/connect-mongo?branch=master)
[![Dependency Status](https://david-dm.org/jdesboeufs/connect-mongo.svg?style=flat)](https://david-dm.org/jdesboeufs/connect-mongo)
[![Greenkeeper badge](https://badges.greenkeeper.io/jdesboeufs/connect-mongo.svg)](https://greenkeeper.io/)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)

## Compatibility

* Support Express up to `5.0`
* Support all Connect versions
* Support [Mongoose](http://mongoosejs.com/index.html) `>= 4.1.2+`
* Support [native MongoDB driver](http://mongodb.github.io/node-mongodb-native/) `>= 2.0.36`
* Support Node.js 4, 6 and 8
* Support [MongoDB](https://www.mongodb.com/) `>= 3.0`

For extended compatibility, see previous versions.

## Usage

### Express or Connect integration

Express `4.x`, `5.0` and Connect `3.x`:

```js
const session = require('express-session');
const MongoStore = require('connect-mongo')(session);

app.use(session({
    secret: 'foo',
    store: new MongoStore(options)
}));
```

Express `2.x`, `3.x` and Connect `1.x`, `2.x`:

```js
const MongoStore = require('connect-mongo')(express);

app.use(express.session({
    secret: 'foo',
    store: new MongoStore(options)
}));
```

For Connect `1.x` and `2.x`, just replace `express` by `connect`.

### Connection to MongoDB

In many circumstances, `connect-mongo` will not be the only part of your application which need a connection to a MongoDB database. It could be interesting to re-use an existing connection.

Alternatively, you can configure `connect-mongo` to establish a new connection.

#### Re-use a Mongoose connection

```js
const mongoose = require('mongoose');

// Basic usage
mongoose.connect(connectionOptions);

app.use(session({
    store: new MongoStore({ mongooseConnection: mongoose.connection })
}));

// Advanced usage
const connection = mongoose.createConnection(connectionOptions);

app.use(session({
    store: new MongoStore({ mongooseConnection: connection })
}));
```

#### Re-use a native MongoDB driver connection (or a promise)

In this case, you just have to give your `Db` instance to `connect-mongo`.
If the connection is not opened, `connect-mongo` will do it for you.

```js
/*
** There are many ways to create dbInstance.
** You should refer to the driver documentation.
*/

app.use(session({
    store: new MongoStore({ db: dbInstance })
}));
```

Or just give a promise...

```js
app.use(session({
    store: new MongoStore({ dbPromise: dbInstancePromise })
}));
```

#### Create a new connection from a MongoDB connection string

[MongoDB connection strings](http://docs.mongodb.org/manual/reference/connection-string/) are __the best way__ to configure a new connection. For advanced usage, [more options](http://mongodb.github.io/node-mongodb-native/driver-articles/mongoclient.html#mongoclient-connect-options) can be configured with `mongoOptions` property.

```js
// Basic usage
app.use(session({
    store: new MongoStore({ url: 'mongodb://localhost/test-app' })
}));

// Advanced usage
app.use(session({
    store: new MongoStore({
        url: 'mongodb://user12345:foobar@localhost/test-app?authSource=admins&w=1',
        mongoOptions: advancedOptions // See below for details
    })
}));
```

## Events

A `MongoStore` instance will emit the following events:

| Event name | Description | Payload
| ----- | ----- | ----- |
| `create` | A session has been created | `sessionId` |
| `touch` | A session has been touched (but not modified) | `sessionId` |
| `update` | A session has been updated | `sessionId` |
| `set` | A session has been created OR updated _(for compatibility purpose)_ | `sessionId` |
| `destroy` | A session has been destroyed | `sessionId` |

## Session expiration

When the session cookie has an expiration date, `connect-mongo` will use it.

Otherwise, it will create a new one, using `ttl` option.

```js
app.use(session({
    store: new MongoStore({
      url: 'mongodb://localhost/test-app',
      ttl: 14 * 24 * 60 * 60 // = 14 days. Default
    })
}));
```

__Note:__ Each time an user interacts with the server, its session expiration date is refreshed.

## Remove expired sessions

By default, `connect-mongo` uses MongoDB's TTL collection feature (2.2+) to have mongod automatically remove expired sessions. But you can change this behavior.

### Set MongoDB to clean expired sessions (default mode)

`connect-mongo` will create a TTL index for you at startup. You MUST have MongoDB 2.2+ and administration permissions.

```js
app.use(session({
    store: new MongoStore({
      url: 'mongodb://localhost/test-app',
      autoRemove: 'native' // Default
    })
}));
```

__Note:__ If you use `connect-mongo` in a very concurrent environment, you should avoid this mode and prefer setting the index yourself, once!

### Set the compatibility mode

You have an older MongoDB version (compatible with connect-mongo) or you can't or don't want to create a TTL index.

`connect-mongo` will take care of removing expired sessions, using defined interval.

```js
app.use(session({
    store: new MongoStore({
      url: 'mongodb://localhost/test-app',
      autoRemove: 'interval',
      autoRemoveInterval: 10 // In minutes. Default
    })
}));
```

### Disable expired sessions cleaning

You are in production environnement and/or you manage the TTL index elsewhere.

```js
app.use(session({
    store: new MongoStore({
      url: 'mongodb://localhost/test-app',
      autoRemove: 'disabled'
    })
}));
```

## Lazy session update


If you are using [express-session](https://github.com/expressjs/session) >= [1.10.0](https://github.com/expressjs/session/releases/tag/v1.10.0) and don't want to resave all the session on database every single time that the user refresh the page, you can lazy update the session, by limiting a period of time.

```js
app.use(express.session({
    secret: 'keyboard cat',
    saveUninitialized: false, // don't create session until something stored
	resave: false, //don't save session if unmodified
	store: new MongoStore({
		url: 'mongodb://localhost/test-app',
		touchAfter: 24 * 3600 // time period in seconds
	})
}));
```

by doing this, setting `touchAfter: 24 * 3600` you are saying to the session be updated only one time in a period of 24 hours, does not matter how many request's are made (with the exception of those that change something on the session data)

## More options

  - `collection` Collection (default: `sessions`)
  - `fallbackMemory` Fallback to `MemoryStore`. Useful if you want to use MemoryStore in some case, like in development environment.
  - `stringify` If true, connect-mongo will serialize sessions using `JSON.stringify` before
                setting them, and deserialize them with `JSON.parse` when getting them.
                (optional, default: true). This is useful if you are using types that
                MongoDB doesn't support.
  - `serialize` Custom hook for serializing sessions to MongoDB. This is helpful if you need
                to modify the session before writing it out.
  - `unserialize` Custom hook for unserializing sessions from MongoDB. This can be used in
                scenarios where you need to support different types of serializations
                (e.g., objects and JSON strings) or need to modify the session before using
                it in your app.
  - `transformId` (optional) Transform original sessionId in whatever you want to use as storage key.

## Tests

    npm test

The tests use a database called `connect-mongo-test`.

## License

The MIT License
