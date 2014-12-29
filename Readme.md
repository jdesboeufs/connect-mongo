# connect-mongo

MongoDB session store for [Connect](https://github.com/senchalabs/connect) and [Express](http://expressjs.com/)

[![Build Status](https://travis-ci.org/kcbanner/connect-mongo.svg?branch=master)](https://travis-ci.org/kcbanner/connect-mongo) [![Dependency Status](https://david-dm.org/kcbanner/connect-mongo.svg?style=flat)](https://david-dm.org/kcbanner/connect-mongo)

## Compatibility

* Support Express `4.x`, `5.0` and Connect `3.x` through [express-session](https://github.com/expressjs/session)
* Support Express `2.x`, `3.x` and Connect `>= 1.0.3`, `2.x`
* Support [Mongoose](http://mongoosejs.com/index.html) `>= 2.6` and `3.x`
* Support [native MongoDB driver](http://mongodb.github.io/node-mongodb-native/) `>= 1.2` and `2.0`
* Support Node.js `0.8`, `0.10` and `0.11`

## Usage

### Express or Connect integration

Express `4.x`, `5.0` and Connect `3.x`:

```js
var session = require('express-session');
var MongoStore = require('connect-mongo')(session);

app.use(session({
    secret: 'foo',
    store: new MongoStore(options)
}));
```

Express `2.x`, `3.x` and Connect `1.x`, `2.x`:

```js
var MongoStore = require('connect-mongo')(express);

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
var mongoose = require('mongoose');

// Basic usage
mongoose.connect(connectionOptions);

app.use(session({
    store: new MongoStore({ mongooseConnection: mongoose.connection })
}));

// Advanced usage
var connection = mongoose.createConnection(connectionOptions);

app.use(session({
    store: new MongoStore({ mongooseConnection: connection })
}));
```

#### Re-use a native MongoDB driver connection

In this case, you juste have to give your `Db` instance to `connect-mongo`.
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

#### Create a new connection from legacy options

For compatibility purpose, `connect-mongo` can create a basic connection string and set some options for you.

You can't use `mongoOptions` if you choose this mode.

```js
app.use(session({
    store: new MongoStore({
        // Basic usage
        host: 'localhost', // Default, optional
        port: 27017, // Default, optional
        db: 'test-app', // Required

        // Basic authentication (optional)
        username: 'user12345',
        password: 'foobar',

        // Advanced options (optional)
        autoReconnect: true, // Default
        w: 1, // Default,
        ssl: false // Default
    })
}));
```

## More options

  - `collection` Collection (optional, default: `sessions`)
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
  - `hash` (optional) Hash is an object, which will determine wether hash the sid in mongo, since it's not undefined, means sid will be hashed
  - `hash.salt` Salt will be used to hash the sid in mongo, default salt is "connect-mongo"
  - `hash.algorithm` Hash algorithm, default algorithm is "sha1"

## Removing expired sessions

  connect-mongo uses MongoDB's TTL collection feature (2.2+) to
  have mongod automatically remove expired sessions. (mongod runs this
  check every minute.)

  **Note:** By connect/express's default, session cookies are set to
  expire when the user closes their browser (maxAge: null). In accordance
  with standard industry practices, connect-mongo will set these sessions
  to expire two weeks from their last 'set'. You can override this
  behavior by manually setting the maxAge for your cookies -- just keep in
  mind that any value less than 60 seconds is pointless, as mongod will
  only delete expired documents in a TTL collection every minute.

## Tests

You need `mocha`.

    make test

The tests use a database called `connect-mongo-test`.

## License

(The MIT License)

Copyright (c) 2011 Casey Banner &lt;kcbanner@gmail.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
