import type { CryptoAdapter } from './MongoStore'
import util from 'util'

export type CryptoOptions = {
  secret: false | string
  algorithm?: string
  hashing?: string
  encodeas?: string
  key_size?: number
  iv_size?: number
  at_size?: number
}

const createKrupteinAdapter = ({
  secret,
  ...options
}: CryptoOptions): CryptoAdapter => {
  const loadKruptein = async () => {
    // @ts-expect-error
    const { default: Kruptein } = await import('kruptein')
    const kruptein = Kruptein({
      algorithm: 'aes-256-gcm',
      hashing: 'sha512',
      encodeas: 'base64',
      key_size: 32,
      iv_size: 16,
      at_size: 16,
      ...options,
    })
    return {
      get: util.promisify(kruptein.get).bind(kruptein),
      set: util.promisify(kruptein.set).bind(kruptein),
    }
  }
  const krupteinPromise = loadKruptein()

  return {
    async encrypt(payload) {
      const { set } = await krupteinPromise
      const encrypted = await set(secret as string, payload).catch(
        (err: any) => {
          throw new Error(err)
        }
      )
      return encrypted
    },
    async decrypt(encryptedPayload) {
      const { get } = await krupteinPromise
      const plaintext = await get(secret as string, encryptedPayload).catch(
        (err: any) => {
          throw new Error(err)
        }
      )
      try {
        return JSON.parse(plaintext)
      } catch {
        return plaintext
      }
    },
  }
}

export default createKrupteinAdapter
