import { assert } from 'console'
import * as session from 'express-session'
import {
  Collection,
  MongoClient,
  MongoClientOptions,
  WriteConcernSettings,
} from 'mongodb'
import createWebCryptoAdapter from './createWebCryptoAdapter'

export interface CryptoAdapter {
  // If not provided we use WebCrypto
  encrypt: (unencryptedPayload: string) => Promise<string>
  decrypt: (encryptedPayload: string) => Promise<string>
}

export type CryptoOptions =
  | {
      secret: string
    }
  | CryptoAdapter

export type ConnectMongoOptions = {
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
  // FIXME: remove those any
  serialize?: (a: any) => any
  unserialize?: (a: any) => any
  writeOperationOptions?: WriteConcernSettings
  transformId?: (a: any) => any
  crypto?: CryptoOptions
}

type ConcretConnectMongoOptions = {
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
  // FIXME: remove those any
  serialize?: (a: any) => any
  unserialize?: (a: any) => any
  writeOperationOptions?: WriteConcernSettings
  transformId?: (a: any) => any
  // FIXME: remove above any
  crypto?: CryptoAdapter
}

type InternalSessionType = {
  _id: string
  session: any
  expires?: Date
  lastModified?: Date
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {}
const unit: <T>(a: T) => T = (a) => a

function defaultSerializeFunction(
  session: session.SessionData
): session.SessionData {
  // Copy each property of the session to a new object
  const obj = {}
  let prop
  for (prop in session) {
    if (prop === 'cookie') {
      // Convert the cookie instance to an object, if possible
      // This gets rid of the duplicate object under session.cookie.data property
      // @ts-ignore FIXME:
      obj.cookie = session.cookie.toJSON
        ? // @ts-ignore FIXME:
          session.cookie.toJSON()
        : session.cookie
    } else {
      // @ts-ignore FIXME:
      obj[prop] = session[prop]
    }
  }

  return obj as session.SessionData
}

function computeTransformFunctions(options: ConcretConnectMongoOptions) {
  if (options.serialize || options.unserialize) {
    return {
      serialize: options.serialize || defaultSerializeFunction,
      unserialize: options.unserialize || unit,
    }
  }

  if (options.stringify === false) {
    return {
      serialize: defaultSerializeFunction,
      unserialize: unit,
    }
  }
  // Default case
  return {
    serialize: JSON.stringify,
    unserialize: JSON.parse,
  }
}

export default class MongoStore extends session.Store {
  private clientP: Promise<MongoClient>
  private crypto?: CryptoAdapter
  private timer?: NodeJS.Timeout
  collectionP: Promise<Collection<InternalSessionType>>
  private options: ConcretConnectMongoOptions
  // FIXME: remvoe any
  private transformFunctions: {
    serialize: (a: any) => any
    unserialize: (a: any) => any
  }

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
  }: ConnectMongoOptions) {
    super()
    console.debug('create MongoStore instance')
    const options: ConcretConnectMongoOptions = {
      collectionName,
      ttl,
      mongoOptions,
      autoRemove,
      autoRemoveInterval,
      touchAfter,
      stringify,
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
        .collection<InternalSessionType>(options.collectionName)
      await this.setAutoRemove(collection)
      return collection
    })

    if (crypto) {
      if ('secret' in crypto) {
        this.crypto = createWebCryptoAdapter(crypto.secret)
      } else {
        this.crypto = crypto
      }
    }
  }

  static create(options: ConnectMongoOptions): MongoStore {
    return new MongoStore(options)
  }

  private setAutoRemove(
    collection: Collection<InternalSessionType>
  ): Promise<unknown> {
    const removeQuery = () => ({
      expires: {
        $lt: new Date(),
      },
    })
    switch (this.options.autoRemove) {
      case 'native':
        console.debug('Creating MongoDB TTL index')
        return collection.createIndex(
          { expires: 1 },
          {
            background: true,
            expireAfterSeconds: 0,
          }
        )
      case 'interval':
        console.debug('create Timer to remove expired sessions')
        this.timer = setInterval(
          () =>
            collection.deleteMany(removeQuery(), {
              writeConcern: {
                w: 0,
                j: false,
              },
            }),
          this.options.autoRemoveInterval * 1000 * 60
        )
        this.timer.unref()
        return Promise.resolve()
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
   * Decrypt given session data
   * @param session session data to be decrypt. Mutate the input session.
   */
  private async decryptSession(
    session: session.SessionData | undefined | null
  ) {
    if (this.crypto && session) {
      const plaintext = await this.crypto
        .decrypt(session.session)
        .catch((err) => {
          throw new Error(err)
        })
      // @ts-ignore
      session.session = plaintext
    }
  }

  /**
   * Get a session from the store given a session ID (sid)
   * @param sid session ID
   */
  get(
    sid: string,
    callback: (err: any, session?: session.SessionData | null) => void
  ): void {
    ;(async () => {
      try {
        console.debug(`MongoStore#get=${sid}`)
        const collection = await this.collectionP
        const session = await collection.findOne({
          _id: this.computeStorageId(sid),
          $or: [
            { expires: { $exists: false } },
            { expires: { $gt: new Date() } },
          ],
        })
        if (this.crypto && session) {
          await this.decryptSession(
            session as unknown as session.SessionData
          ).catch((err) => callback(err))
        }
        const s =
          session && this.transformFunctions.unserialize(session.session)
        if (this.options.touchAfter > 0 && session?.lastModified) {
          s.lastModified = session.lastModified
        }
        this.emit('get', sid)
        callback(null, s === undefined ? null : s)
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
  set(
    sid: string,
    session: session.SessionData,
    callback: (err: any) => void = noop
  ): void {
    ;(async () => {
      try {
        console.debug(`MongoStore#set=${sid}`)
        // Removing the lastModified prop from the session object before update
        // @ts-ignore
        if (this.options.touchAfter > 0 && session?.lastModified) {
          // @ts-ignore
          delete session.lastModified
        }
        const s: InternalSessionType = {
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
          const data = await this.crypto.encrypt(s.session)
          s.session = data as unknown as session.SessionData
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
    session: session.SessionData & { lastModified?: Date },
    callback: (err: any) => void = noop
  ): void {
    ;(async () => {
      try {
        console.debug(`MongoStore#touch=${sid}`)
        const updateFields: {
          lastModified?: Date
          expires?: Date
          session?: session.SessionData
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
            console.debug(`Skip touching session=${sid}`)
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
    callback: (
      err: any,
      obj?:
        | session.SessionData[]
        | { [sid: string]: session.SessionData }
        | null
    ) => void
  ): void {
    ;(async () => {
      try {
        console.debug('MongoStore#all()')
        const collection = await this.collectionP
        const sessions = collection.find({
          $or: [
            { expires: { $exists: false } },
            { expires: { $gt: new Date() } },
          ],
        })
        const results: session.SessionData[] = []
        for await (const session of sessions) {
          if (this.crypto && session) {
            await this.decryptSession(session as unknown as session.SessionData)
          }
          results.push(this.transformFunctions.unserialize(session.session))
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
    console.debug(`MongoStore#destroy=${sid}`)
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
    console.debug('MongoStore#length()')
    this.collectionP
      .then((collection) => collection.countDocuments())
      .then((c) => callback(null, c))
      // @ts-ignore
      .catch((err) => callback(err))
  }

  /**
   * Delete all sessions from the store.
   */
  clear(callback: (err: any) => void = noop): void {
    console.debug('MongoStore#clear()')
    this.collectionP
      .then((collection) => collection.drop())
      .then(() => callback(null))
      .catch((err) => callback(err))
  }

  /**
   * Close database connection
   */
  close(): Promise<void> {
    console.debug('MongoStore#close()')
    return this.clientP.then((c) => c.close())
  }
}
