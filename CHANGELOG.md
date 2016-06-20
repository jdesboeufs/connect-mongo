1.2.1 / 2016-06-20
=================

* __Fix__ bluebird warning (Awk34)

1.2.0 / 2016-05-13
=================

* Accept `dbPromise` as connection param
* _Add_ `close()` method to close current connection

1.1.0 / 2015-12-24
=================

* Support mongodb `2.1.x`

1.0.2 / 2015-12-18
=================

* Enforce entry-points

1.0.1 / 2015-12-17
=================

* __Fix__ entry-point

1.0.0 (deprecated) / 2015-12-17
==================

__Breaking changes:__
* __For older Node.js version (`< 4.0`), the module must be loaded using `require('connect-mongo/es5')`__
* __Drop__ `hash` option (advanced)

__Others changes:__
* __Add__ `transformId` option to allow custom transformation on session id (advanced)
* __Rewrite in ES6__ (w/ fallback)
* Update dependencies
* Improve compatibility

0.8.2 / 2015-07-14
==================

* Bug fixes and improvements (whitef0x0, TimothyGu, behcet-li)


0.8.1 / 2015-04-21
==================

* __Fix__ initialization when a connecting `mongodb` `2.0.x` instance is given (1999)


0.8.0 / 2015-03-24
==================

* __Add__ `touchAfter` option to enable lazy update behavior on `touch()` method (rafaelcardoso)
* __Add__ `fallbackMemory` option to switch to `MemoryStore` in some case.


0.7.0 / 2015-01-24
==================

* __Add__ `touch()` method to be fully compliant with `express-session` `>= 1.10` (rafaelcardoso)


0.6.0 / 2015-01-12
==================

* __Add__ `ttl` option
* __Add__ `autoRemove` option
* __Deprecate__ `defaultExpirationTime` option. Use `ttl` instead (in seconds)


0.5.3 / 2014-12-30
==================

* Make callbacks optional


0.5.2 / 2014-12-29
==================

* Extend compatibility to `mongodb` `2.0.x`


0.5.1 / 2014-12-28
==================

* [bugfix] #143 Missing Sessions from DB should still make callback (brekkehj)


0.5.0 (deprecated) / 2014-12-25
==================

* Accept full-featured [MongoDB connection strings](http://docs.mongodb.org/manual/reference/connection-string/) as `url` + [advanced options](http://mongodb.github.io/node-mongodb-native/1.4/driver-articles/mongoclient.html)
* Re-use existing or upcoming mongoose connection
* [DEPRECATED] `mongoose_connection` is renamed `mongooseConnection`
* [DEPRECATED] `auto_reconnect` is renamed `autoReconnect`
* [BREAKING] `autoReconnect` option is now `true` by default
* [BREAKING] Insert `collection` option in `url` in not possible any more
* [BREAKING] Replace for-testing-purpose `callback` by `connected` event
* Add debug (use with `DEBUG=connect-mongo`)
* Improve error management
* Compatibility with `mongodb` `>= 1.2.0` and `< 2.0.0`
* Fix many bugs


0.4.2 / 2014-12-18
==================

  * Bumped mongodb version from 1.3.x to 1.4.x (B0k0)
  * Add `sid` hash capability (ZheFeng)
  * Add `serialize` and `unserialize` options (ksheedlo)


0.3.3 / 2013-07-04
==================

  * Merged a change which reduces data duplication


0.3.0 / 2013-01-20
==================

  * Merged several changes by Ken Pratt, including Write Concern support
  * Updated to `mongodb` version 1.2

0.2.0 / 2012-09-09
==================

  * Integrated pull request for `mongoose_connection` option
  * Move to mongodb 1.0.x

0.1.5 / 2010-07-07
==================

  * Made collection setup more robust to avoid race condition


0.1.4 / 2010-06-28
==================

  * Added session expiry


0.1.3 / 2010-06-27
==================

  * Added url support


0.1.2 / 2010-05-18
==================

  * Added auto_reconnect option


0.1.1 / 2010-03-18
==================

  * Fixed authentication


0.1.0 / 2010-03-08
==================

  * Initial release
