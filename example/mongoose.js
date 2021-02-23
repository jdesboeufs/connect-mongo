const express = require('express')
const session = require('express-session')
const MongoStore = require('connect-mongo').default
const mongoose = require('mongoose');

const app = express()
const port = 3000

const clientP = mongoose.connect(
  'mongodb://root:example@127.0.0.1:27017',
  { useNewUrlParser: true, useUnifiedTopology: true }
).then(m => m.connection.getClient())

app.use(session({
  secret: 'foo',
  store: MongoStore.create({
    clientPromise: clientP,
    dbName: "example-db-mongoose",
    stringify: false,
  })
}));

app.get('/', (req, res) => {
  req.session.foo = 'test-id'
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})
