# V6 migration guide

To migrate the library from V5 to V6, update the dependencies:

If you are using `npm`

```
npm install connect-mongo@latest kruptein@3
```

If you are using `yarn`

```
yarn add connect-mongo@latest kruptein@3
```

Next step is to import the dependencies and adjust the crypto config:

Javascript:
```js
app.use(session({
  secret: 'foo',
  store: MongoStore.create(options)
}));
```

Typescript:
```ts
import MongoStore, { createKrupteinAdapter } from 'connect-mongo'
app.use(session({
  secret: 'foo',
  store: MongoStore.create({
    crypto: createKrupteinAdapter(options.crypto)
  })
}));
```


- If you don't have crypto options, there is no breaking change.
- If you want to use WebCrypto API instead, you can remove the kruptein dependency and use:
```ts
import MongoStore, { createWebCryptoAdapter } from 'connect-mongo'
```