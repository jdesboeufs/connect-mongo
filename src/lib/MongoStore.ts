import assert from 'node:assert/strict'
import util from 'util'
import * as session from 'express-session'
import {
  Collection,
  MongoClient,
  MongoClientOptions,
  WriteConcernSettings,
} from 'mongodb'
import Debug from 'debug'
import kruptein from 'kruptein'

type Kruptein = ReturnType<typeof kruptein>

const debug = Debug('connect-mongo')

export type CryptoOptions = {
  secret: false | string
  algorithm?: string
  hashing?: string
  encodeas?: string
  key_size?: number
  iv_size?: number
  at_size?: number
}

type StoredSessionValue = session.SessionData | string
type Serialize<T extends session.SessionData> = (
  session: T
) => StoredSessionValue
type Unserialize<T extends session.SessionData> = (
  payload: StoredSessionValue
) => T
type TransformFunctions<T extends session.SessionData> = {
  serialize: Serialize<T>
  unserialize: Unserialize<T>
}

export type ConnectMongoOptions<
  T extends session.SessionData = session.SessionData,
> = {
  mongoUrl?: string
  clientPromise?: Promise<MongoClient>
  client?: MongoClient
  collectionName?: string
  mongoOptions?: MongoClientOptions
  dbName?: string
  ttl?: number
  touchAfter?: number
  stringify?: boolean
  createAutoRemoveIdx?: boolean
  autoRemove?: 'native' | 'interval' | 'disabled'
  autoRemoveInterval?: number
  serialize?: Serialize<T>
  unserialize?: Unserialize<T>
  writeOperationOptions?: WriteConcernSettings
  transformId?: (sid: string) => string
  crypto?: CryptoOptions
}

type ConcretCryptoOptions = Required<CryptoOptions>

type ConcretConnectMongoOptions<
  T extends session.SessionData = session.SessionData,
> = {
  mongoUrl?: string
  clientPromise?: Promise<MongoClient>
  client?: MongoClient
  collectionName: string
  mongoOptions: MongoClientOptions
  dbName?: string
  ttl: number
  createAutoRemoveIdx?: boolean
  autoRemove: 'native' | 'interval' | 'disabled'
  autoRemoveInterval: number
  touchAfter: number
  stringify: boolean
  serialize?: Serialize<T>
  unserialize?: Unserialize<T>
  writeOperationOptions?: WriteConcernSettings
  transformId?: (sid: string) => string
  crypto: ConcretCryptoOptions
}

type InternalSessionType<T extends session.SessionData> = {
  _id: string
  session: StoredSessionValue | T
  expires?: Date
  lastModified?: Date
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {}
const unit: <T>(a: T) => T = (a) => a

function defaultSerializeFunction<T extends session.SessionData>(
  currentSession: T
): T {
  const result: session.SessionData = {
    cookie: currentSession.cookie,
  } as session.SessionData
  Object.entries(currentSession).forEach(([key, value]) => {
    if (
      key === 'cookie' &&
      value &&
      typeof (value as { toJSON?: () => unknown }).toJSON === 'function'
    ) {
      result.cookie = (
        value as { toJSON: () => unknown }
      ).toJSON() as session.Cookie
    } else {
      ;(result as Record<string, unknown>)[key] = value as unknown
    }
  })

  return result as T
}

function computeTransformFunctions<T extends session.SessionData>(
  options: ConcretConnectMongoOptions<T>
): TransformFunctions<T> {
  if (options.serialize || options.unserialize) {
    return {
      serialize: options.serialize || defaultSerializeFunction,
      unserialize: (options.unserialize || unit) as Unserialize<T>,
    }
  }

  if (options.stringify === false) {
    return {
      serialize: defaultSerializeFunction,
      unserialize: unit as Unserialize<T>,
    }
  }
  // Default case
  return {
    serialize: (value) => JSON.stringify(value),
    unserialize: (payload) => JSON.parse(payload as string) as T,
  }
}

export default class MongoStore<
  T extends session.SessionData = session.SessionData,
> extends session.Store {
  private clientP: Promise<MongoClient>
  private readonly crypto: Kruptein | null = null
  private timer?: NodeJS.Timeout
  collectionP: Promise<Collection<InternalSessionType<T>>>
  private options: ConcretConnectMongoOptions<T>
  private transformFunctions: TransformFunctions<T>

  constructor({
    collectionName = 'sessions',
    ttl = 1209600,
    mongoOptions = {},
    autoRemove = 'native',
    autoRemoveInterval = 10,
    touchAfter = 0,
    stringify = true,
    crypto,
    ...required
  }: ConnectMongoOptions<T>) {
    super()
    debug('create MongoStore instance')
    const options: ConcretConnectMongoOptions<T> = {
      collectionName,
      ttl,
      mongoOptions,
      autoRemove,
      autoRemoveInterval,
      touchAfter,
      stringify,
      crypto: {
        ...{
          secret: false,
          algorithm: 'aes-256-gcm',
          hashing: 'sha512',
          encodeas: 'base64',
          key_size: 32,
          iv_size: 16,
          at_size: 16,
        },
        ...crypto,
      },
      ...required,
    }
    // Check params
    assert(
      options.mongoUrl || options.clientPromise || options.client,
      'You must provide either mongoUrl|clientPromise|client in options'
    )
    assert(
      options.createAutoRemoveIdx === null ||
        options.createAutoRemoveIdx === undefined,
      'options.createAutoRemoveIdx has been reverted to autoRemove and autoRemoveInterval'
    )
    assert(
      !options.autoRemoveInterval || options.autoRemoveInterval <= 71582,
      /* (Math.pow(2, 32) - 1) / (1000 * 60) */ 'autoRemoveInterval is too large. options.autoRemoveInterval is in minutes but not seconds nor mills'
    )
    this.transformFunctions = computeTransformFunctions(options)
    let _clientP: Promise<MongoClient>
    if (options.mongoUrl) {
      _clientP = MongoClient.connect(options.mongoUrl, options.mongoOptions)
    } else if (options.clientPromise) {
      _clientP = options.clientPromise
    } else if (options.client) {
      _clientP = Promise.resolve(options.client)
    } else {
      throw new Error('Cannot init client. Please provide correct options')
    }
    assert(!!_clientP, 'Client is null|undefined')
    this.clientP = _clientP
    this.options = options
    this.collectionP = _clientP.then(async (con) => {
      const collection = con
        .db(options.dbName)
        .collection<InternalSessionType<T>>(options.collectionName)
      await this.setAutoRemove(collection)
      return collection
    })
    if (options.crypto.secret) {
      this.crypto = kruptein(options.crypto)
    }
  }

  static create<U extends session.SessionData = session.SessionData>(
    options: ConnectMongoOptions<U>
  ): MongoStore<U> {
    return new MongoStore<U>(options)
  }

  private setAutoRemove(
    collection: Collection<InternalSessionType<T>>
  ): Promise<unknown> {
    const removeQuery = () => ({
      expires: {
        $lt: new Date(),
      },
    })
    switch (this.options.autoRemove) {
      case 'native':
        debug('Creating MongoDB TTL index')
        return collection.createIndex(
          { expires: 1 },
          {
            background: true,
            expireAfterSeconds: 0,
          }
        )
      case 'interval': {
        debug('create Timer to remove expired sessions')
        const runIntervalRemove = () =>
          collection
            .deleteMany(removeQuery(), {
              writeConcern: {
                w: 0,
              },
            })
            .catch((err) => {
              debug(
                'autoRemove interval cleanup failed: %s',
                (err as Error)?.message ?? err
              )
            })
        this.timer = setInterval(
          () => {
            void runIntervalRemove()
          },
          this.options.autoRemoveInterval * 1000 * 60
        )
        this.timer.unref()
        return Promise.resolve()
      }
      case 'disabled':
      default:
        return Promise.resolve()
    }
  }

  private computeStorageId(sessionId: string) {
    if (
      this.options.transformId &&
      typeof this.options.transformId === 'function'
    ) {
      return this.options.transformId(sessionId)
    }
    return sessionId
  }

  /**
   * promisify and bind the `this.crypto.get` function.
   * Please check !!this.crypto === true before using this getter!
   */
  private get cryptoGet() {
    if (!this.crypto) {
      throw new Error('Check this.crypto before calling this.cryptoGet!')
    }
    return util.promisify(this.crypto.get).bind(this.crypto)
  }

  /**
   * Decrypt given session data
   * @param session session data to be decrypt. Mutate the input session.
   */
  private async decryptSession(
    sessionDoc: InternalSessionType<T> | undefined | null
  ) {
    if (this.crypto && sessionDoc && typeof sessionDoc.session === 'string') {
      const plaintext = (await this.cryptoGet(
        this.options.crypto.secret as string,
        sessionDoc.session
      )) as string
      sessionDoc.session = JSON.parse(plaintext) as StoredSessionValue
    }
  }

  /**
   * Get a session from the store given a session ID (sid)
   * @param sid session ID
   */
  get(sid: string, callback: (err: any, session?: T | null) => void): void {
    ;(async () => {
      try {
        debug(`MongoStore#get=${sid}`)
        const collection = await this.collectionP
        const sessionDoc = await collection.findOne({
          _id: this.computeStorageId(sid),
          $or: [
            { expires: { $exists: false } },
            { expires: { $gt: new Date() } },
          ],
        })
        if (this.crypto && sessionDoc) {
          try {
            await this.decryptSession(sessionDoc)
          } catch (error) {
            callback(error)
            return
          }
        }
        let result: T | undefined
        if (sessionDoc) {
          result = this.transformFunctions.unserialize(sessionDoc.session)
          if (this.options.touchAfter > 0 && sessionDoc.lastModified) {
            ;(result as T & { lastModified?: Date }).lastModified =
              sessionDoc.lastModified
          }
        }
        this.emit('get', sid)
        callback(null, result ?? null)
      } catch (error) {
        callback(error)
      }
    })()
  }

  /**
   * Upsert a session into the store given a session ID (sid) and session (session) object.
   * @param sid session ID
   * @param session session object
   */
  set(sid: string, session: T, callback: (err: any) => void = noop): void {
    ;(async () => {
      try {
        debug(`MongoStore#set=${sid}`)
        // Removing the lastModified prop from the session object before update
        if (this.options.touchAfter > 0 && session?.lastModified) {
          delete (session as T & { lastModified?: Date }).lastModified
        }
        const s: InternalSessionType<T> = {
          _id: this.computeStorageId(sid),
          session: this.transformFunctions.serialize(session),
        }
        // Expire handling
        if (session?.cookie?.expires) {
          s.expires = new Date(session.cookie.expires)
        } else {
          // If there's no expiration date specified, it is
          // browser-session cookie or there is no cookie at all,
          // as per the connect docs.
          //
          // So we set the expiration to two-weeks from now
          // - as is common practice in the industry (e.g Django) -
          // or the default specified in the options.
          s.expires = new Date(Date.now() + this.options.ttl * 1000)
        }
        // Last modify handling
        if (this.options.touchAfter > 0) {
          s.lastModified = new Date()
        }
        if (this.crypto) {
          const cryptoSet = util.promisify(this.crypto.set).bind(this.crypto)
          const data = await cryptoSet(
            this.options.crypto.secret as string,
            s.session
          ).catch((err) => {
            throw new Error(err)
          })
          s.session = data as StoredSessionValue
        }
        const collection = await this.collectionP
        const rawResp = await collection.updateOne(
          { _id: s._id },
          { $set: s },
          {
            upsert: true,
            writeConcern: this.options.writeOperationOptions,
          }
        )
        if (rawResp.upsertedCount > 0) {
          this.emit('create', sid)
        } else {
          this.emit('update', sid)
        }
        this.emit('set', sid)
      } catch (error) {
        return callback(error)
      }
      return callback(null)
    })()
  }

  touch(
    sid: string,
    session: T & { lastModified?: Date },
    callback: (err: any) => void = noop
  ): void {
    ;(async () => {
      try {
        debug(`MongoStore#touch=${sid}`)
        const updateFields: {
          lastModified?: Date
          expires?: Date
          session?: T
        } = {}
        const touchAfter = this.options.touchAfter * 1000
        const lastModified = session.lastModified
          ? session.lastModified.getTime()
          : 0
        const currentDate = new Date()

        // If the given options has a touchAfter property, check if the
        // current timestamp - lastModified timestamp is bigger than
        // the specified, if it's not, don't touch the session
        if (touchAfter > 0 && lastModified > 0) {
          const timeElapsed = currentDate.getTime() - lastModified
          if (timeElapsed < touchAfter) {
            debug(`Skip touching session=${sid}`)
            return callback(null)
          }
          updateFields.lastModified = currentDate
        }

        if (session?.cookie?.expires) {
          updateFields.expires = new Date(session.cookie.expires)
        } else {
          updateFields.expires = new Date(Date.now() + this.options.ttl * 1000)
        }
        const collection = await this.collectionP
        const rawResp = await collection.updateOne(
          { _id: this.computeStorageId(sid) },
          { $set: updateFields },
          { writeConcern: this.options.writeOperationOptions }
        )
        if (rawResp.matchedCount === 0) {
          return callback(new Error('Unable to find the session to touch'))
        } else {
          this.emit('touch', sid, session)
          return callback(null)
        }
      } catch (error) {
        return callback(error)
      }
    })()
  }

  /**
   * Get all sessions in the store as an array
   */
  all(
    callback: (err: any, obj?: T[] | { [sid: string]: T } | null) => void
  ): void {
    ;(async () => {
      try {
        debug('MongoStore#all()')
        const collection = await this.collectionP
        const sessions = collection.find({
          $or: [
            { expires: { $exists: false } },
            { expires: { $gt: new Date() } },
          ],
        })
        const results: T[] = []
        for await (const sessionDoc of sessions) {
          if (this.crypto && sessionDoc) {
            await this.decryptSession(sessionDoc)
          }
          results.push(this.transformFunctions.unserialize(sessionDoc.session))
        }
        this.emit('all', results)
        callback(null, results)
      } catch (error) {
        callback(error)
      }
    })()
  }

  /**
   * Destroy/delete a session from the store given a session ID (sid)
   * @param sid session ID
   */
  destroy(sid: string, callback: (err: any) => void = noop): void {
    debug(`MongoStore#destroy=${sid}`)
    this.collectionP
      .then((colleciton) =>
        colleciton.deleteOne(
          { _id: this.computeStorageId(sid) },
          { writeConcern: this.options.writeOperationOptions }
        )
      )
      .then(() => {
        this.emit('destroy', sid)
        callback(null)
      })
      .catch((err) => callback(err))
  }

  /**
   * Get the count of all sessions in the store
   */
  length(callback: (err: any, length: number) => void): void {
    debug('MongoStore#length()')
    this.collectionP
      .then((collection) => collection.countDocuments())
      .then((c) => callback(null, c))
      .catch((err: unknown) => callback(err, 0))
  }

  /**
   * Delete all sessions from the store.
   */
  clear(callback: (err: any) => void = noop): void {
    debug('MongoStore#clear()')
    this.collectionP
      .then((collection) =>
        collection.deleteMany(
          {},
          { writeConcern: this.options.writeOperationOptions }
        )
      )
      .then(() => callback(null))
      .catch((err: unknown) => {
        const message = (err as Error | undefined)?.message ?? ''
        // NamespaceNotFound (code 26) occurs if the collection was dropped earlier; treat as success to keep clear() idempotent.
        if (
          (err as { code?: number })?.code === 26 ||
          /ns not found/i.test(message)
        ) {
          callback(null)
          return
        }
        callback(err)
      })
  }

  /**
   * Close database connection
   */
  close(): Promise<void> {
    debug('MongoStore#close()')
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    return this.clientP.then((c) => c.close())
  }
}
