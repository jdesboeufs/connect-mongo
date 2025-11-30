import util from 'node:util'
import { webcrypto } from 'node:crypto'
import kruptein from 'kruptein'

export interface CryptoAdapter {
  encrypt: (unencryptedPayload: string) => Promise<string>
  decrypt: (encryptedPayload: string) => Promise<string>
}

export type CryptoOptions = {
  secret: false | string
  algorithm?: string
  hashing?: string
  encodeas?: string
  key_size?: number
  iv_size?: number
  at_size?: number
}

export type ConcretCryptoOptions = Required<CryptoOptions>

/* eslint-disable camelcase */
export const defaultCryptoOptions: ConcretCryptoOptions = {
  secret: false,
  algorithm: 'aes-256-gcm',
  hashing: 'sha512',
  encodeas: 'base64',
  key_size: 32,
  iv_size: 16,
  at_size: 16,
}
/* eslint-enable camelcase */

export const createKrupteinAdapter = (
  options: CryptoOptions
): CryptoAdapter => {
  const merged: ConcretCryptoOptions = {
    ...defaultCryptoOptions,
    ...options,
  }
  if (!merged.secret) {
    throw new Error('createKrupteinAdapter requires a non-empty secret')
  }
  const instance = kruptein(merged)
  const encrypt = util.promisify(instance.set).bind(instance)
  const decrypt = util.promisify(instance.get).bind(instance)

  return {
    async encrypt(plaintext: string): Promise<string> {
      const ciphertext = await encrypt(merged.secret as string, plaintext)
      return String(ciphertext)
    },
    async decrypt(ciphertext: string): Promise<string> {
      const plaintext = await decrypt(merged.secret as string, ciphertext)
      if (typeof plaintext === 'string') {
        return plaintext
      }
      return JSON.stringify(plaintext)
    },
  }
}

export type WebCryptoEncoding = 'base64' | 'base64url' | 'hex'

export type WebCryptoAdapterOptions = {
  secret: string | ArrayBuffer | ArrayBufferView
  ivLength?: number
  encoding?: WebCryptoEncoding
  algorithm?: 'AES-GCM' | 'AES-CBC'
  salt?: string | ArrayBuffer | ArrayBufferView
  iterations?: number
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toUint8Array = (
  input: string | ArrayBuffer | ArrayBufferView
): Uint8Array => {
  if (typeof input === 'string') {
    return encoder.encode(input)
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input)
  }
  throw new TypeError('Unsupported secret type for Web Crypto adapter')
}

const encodeBytes = (
  bytes: Uint8Array,
  encoding: WebCryptoEncoding
): string => {
  switch (encoding) {
    case 'hex':
      return Buffer.from(bytes).toString('hex')
    case 'base64url':
      return Buffer.from(bytes).toString('base64url')
    case 'base64':
    default:
      return Buffer.from(bytes).toString('base64')
  }
}

const decodeBytes = (
  payload: string,
  encoding: WebCryptoEncoding
): Uint8Array => {
  switch (encoding) {
    case 'hex':
      return new Uint8Array(Buffer.from(payload, 'hex'))
    case 'base64url':
      return new Uint8Array(Buffer.from(payload, 'base64url'))
    case 'base64':
    default:
      return new Uint8Array(Buffer.from(payload, 'base64'))
  }
}

export const createWebCryptoAdapter = ({
  secret,
  ivLength,
  encoding = 'base64',
  algorithm = 'AES-GCM',
  salt,
  iterations = 310000,
}: WebCryptoAdapterOptions): CryptoAdapter => {
  if (!secret) {
    throw new Error('createWebCryptoAdapter requires a secret')
  }
  const { subtle } = webcrypto

  if (!subtle?.decrypt || !webcrypto?.getRandomValues) {
    throw new Error('Web Crypto API is not available in this runtime')
  }

  const resolvedIvLength = ivLength ?? (algorithm === 'AES-GCM' ? 12 : 16)
  const resolvedSalt =
    salt ?? encoder.encode('connect-mongo:webcrypto-default-salt')

  const deriveKey = async () => {
    const secretBytes = toUint8Array(secret)
    const baseKey = await subtle.importKey(
      'raw',
      secretBytes,
      'PBKDF2',
      false,
      ['deriveKey']
    )
    const saltBytes =
      typeof resolvedSalt === 'string'
        ? encoder.encode(resolvedSalt)
        : toUint8Array(resolvedSalt)
    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations,
        hash: 'SHA-256',
      },
      baseKey,
      { name: algorithm, length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  }

  const keyPromise = deriveKey()

  return {
    async encrypt(plaintext: string): Promise<string> {
      const key = await keyPromise
      const iv = webcrypto.getRandomValues(new Uint8Array(resolvedIvLength))
      const data = encoder.encode(plaintext)
      const encrypted = await subtle.encrypt({ name: algorithm, iv }, key, data)
      const cipherBytes = new Uint8Array(encrypted)
      const combined = new Uint8Array(resolvedIvLength + cipherBytes.byteLength)
      combined.set(iv, 0)
      combined.set(cipherBytes, resolvedIvLength)
      return encodeBytes(combined, encoding)
    },
    async decrypt(ciphertext: string): Promise<string> {
      const key = await keyPromise
      const combined = decodeBytes(ciphertext, encoding)
      const iv = combined.slice(0, resolvedIvLength)
      const data = combined.slice(resolvedIvLength)
      const decrypted = await subtle.decrypt({ name: algorithm, iv }, key, data)
      return decoder.decode(decrypted)
    },
  }
}
