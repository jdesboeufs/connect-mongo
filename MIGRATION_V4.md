# V4 migration guide

To migrate the library from V3 to V4, re-install the dependencies.

If you are using `npm`

```
npm uninstall connect-mongo
npm uninstall @types/connect-mongo
npm install -D connect-mongo@next
```

If you are using `yarn`

```
yarn remove connect-mongo
yarn remove @types/connect-mongo
yarn add -D connect-mongo@next
```

Next step is to import the dependencies

```js
const MongoStore = require('connect-mongo');
```

```ts
import MongoStore from 'connect-mongo';
```

Create the store using `MongoStore.create({options})` instead of `new MongoStore({options})`

```js
app.use(session({
  secret: 'foo',
  store: MongoStore.create(options)
}));
```

For the options, you should make the following changes:

* Change `url` to `mongoUrl`
* Keep `clientPromise` if you are using it
* `mongooseConnection` & `clientPromise` have been removed. Please update your application code to use either `mongoUrl` or `clientPromise`
* Remove `autoRemove` & `autoRemoveInterval` option if your are using and check if you need to set the `createAutoRemoveIdx` option
* Remove `fallbackMemory` option and if you are using it, you can import from:

```js
const session = require('express-session');

app.use(session({
  store: new session.MemoryStore()
}));
```
