0.5.0 / In development
==================

* Accept full-featured [MongoDB connection strings](http://docs.mongodb.org/manual/reference/connection-string/) as `url` + [advanced options](http://mongodb.github.io/node-mongodb-native/1.4/driver-articles/mongoclient.html)
* Re-use existing or upcoming mongoose connection
* [DEPRECATED] `mongoose_connection` is renamed `mongooseConnection`
* [DEPRECATED] `auto_reconnect` is renamed `autoReconnect`
* [BREAKING] `autoReconnect` option is now `true` by default
* [BREAKING] Pass `collection` option in `url` in not possible any more
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
