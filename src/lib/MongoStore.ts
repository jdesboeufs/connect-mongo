import * as session from 'express-session'
import {
  Collection,
  CommonOptions,
  MongoClient,
  MongoClientOptions,
} from 'mongodb'

export type ConnectMongoOptions = {
  mongoUrl: string
  collectionName?: string
  mongoOptions?: MongoClientOptions
  dbName?: string
  ttl?: number
  createAutoRemoveIdx?: boolean
  touchAfter?: number
  stringify?: boolean
  // FIXME: remove those any
  serialize?: (a: any) => any
  unserialize?: (a: any) => any
  writeOperationOptions?: CommonOptions
  transformId?: (a: any) => any
}

type ConcretConnectMongoOptions = {
  mongoUrl: string
  collectionName: string
  mongoOptions: MongoClientOptions
  dbName?: string
  ttl: number
  createAutoRemoveIdx?: boolean
  touchAfter: number
  stringify: boolean
  // FIXME: remove those any
  serialize?: (a: any) => any
  unserialize?: (a: any) => any
  writeOperationOptions?: CommonOptions
  transformId?: (a: any) => any
  // FIXME: remove above any
}

type ErrorOrNull = Error | null

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

export default class MongoStoreV2 extends session.Store {
  private clientP: Promise<MongoClient>
  collectionP: Promise<Collection>
  private options: ConcretConnectMongoOptions
  // FIXME: remvoe any
  private transformFunctions: {
    serialize: (a: any) => any
    unserialize: (a: any) => any
  }

  constructor({
    collectionName = 'sessions',
    ttl = 1209600,
    mongoOptions = { useUnifiedTopology: true },
    createAutoRemoveIdx = true,
    touchAfter = 0,
    stringify = true,
    ...required
  }: ConnectMongoOptions) {
    super()
    const options: ConcretConnectMongoOptions = {
      collectionName,
      ttl,
      mongoOptions,
      createAutoRemoveIdx,
      touchAfter,
      stringify,
      ...required,
    }
    // console.log('constructor', options)
    this.transformFunctions = computeTransformFunctions(options)
    const _clientP = MongoClient.connect(options.mongoUrl, options.mongoOptions)
    this.clientP = _clientP
    this.options = options
    this.collectionP = _clientP
      .then((con) => con.db(options.dbName))
      .then((db) => db.collection(options.collectionName))
      .then((collection) => {
        if (options.createAutoRemoveIdx) {
          collection.createIndex(
            { expires: 1 },
            { expireAfterSeconds: 0, ...options.writeOperationOptions }
          )
        }
        return collection
      })
  }

  static create(options: ConnectMongoOptions): MongoStoreV2 {
    return new MongoStoreV2(options)
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
   * Get a session from the store given a session ID (sid)
   * @param sid session ID
   */
  get(
    sid: string,
    callback: (err: ErrorOrNull, session?: session.SessionData | null) => void
  ): void {
    ;(async () => {
      try {
        const collection = await this.collectionP
        const session = await collection.findOne({
          _id: this.computeStorageId(sid),
          $or: [
            { expires: { $exists: false } },
            { expires: { $gt: new Date() } },
          ],
        })
        const s =
          session && this.transformFunctions.unserialize(session.session)
        if (this.options.touchAfter > 0 && session.lastModified) {
          s.lastModified = session.lastModified
        }
        this.emit('get', sid)
        callback(null, s)
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
    callback: (err: ErrorOrNull) => void = noop
  ): void {
    ;(async () => {
      try {
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
        const collection = await this.collectionP
        const rawResp = await collection.updateOne(
          { _id: s._id },
          { $set: s },
          {
            upsert: true,
            ...this.options.writeOperationOptions,
          }
        )
        if (rawResp.upsertedCount > 0) {
          this.emit('create', sid)
        } else {
          this.emit('update', sid)
        }
        this.emit('set', sid)
        callback(null)
      } catch (error) {
        callback(error)
      }
    })()
  }

  touch(
    sid: string,
    session: session.SessionData & { lastModified?: Date },
    callback: (err: ErrorOrNull) => void = noop
  ): void {
    ;(async () => {
      try {
        const updateFields: { lastModified?: Date; expires?: Date } = {}
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
          this.options.writeOperationOptions
        )
        if (rawResp.modifiedCount === 0) {
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
      err: ErrorOrNull,
      obj?:
        | session.SessionData[]
        | { [sid: string]: session.SessionData }
        | null
    ) => void
  ): void {
    ;(async () => {
      try {
        const collection = await this.collectionP
        const sessions = collection.find({
          $or: [
            { expires: { $exists: false } },
            { expires: { $gt: new Date() } },
          ],
        })
        const results: session.SessionData[] = []
        sessions.forEach(
          (session) => {
            results.push(this.transformFunctions.unserialize(session.session))
          },
          (err) => {
            if (err) {
              callback(err)
            } else {
              this.emit('all', results)
              callback(null, results)
            }
          }
        )
      } catch (error) {
        callback(error)
      }
    })()
  }

  /**
   * Destroy/delete a session from the store given a session ID (sid)
   * @param sid session ID
   */
  destroy(sid: string, callback: (err: ErrorOrNull) => void = noop): void {
    this.collectionP
      .then((colleciton) =>
        colleciton.deleteOne(
          { _id: this.computeStorageId(sid) },
          this.options.writeOperationOptions
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
  length(callback: (err: ErrorOrNull, length: number) => void): void {
    this.collectionP
      .then((collection) => collection.countDocuments())
      .then((c) => callback(null, c))
      // @ts-ignore
      .catch((err) => callback(err))
  }

  /**
   * Delete all sessions from the store.
   */
  clear(callback: (err: ErrorOrNull) => void = noop): void {
    this.collectionP
      .then((collection) => collection.drop())
      .then(() => callback(null))
      .catch((err) => callback(err))
  }

  /**
   * Close database connection
   */
  close(): Promise<void> {
    return this.clientP.then((c) => c.close())
  }
}
