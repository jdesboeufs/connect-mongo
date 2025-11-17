import type { CryptoAdapter } from './MongoStore'

const createWebCryptoAdapter = (secret: string): CryptoAdapter => {
  const encoder = new TextEncoder()
  const lazyLoadedKeyMaterial = crypto.subtle
    .importKey('raw', encoder.encode(secret), 'PBKDF2', false, [
      'deriveBits',
      'deriveKey',
    ])
    .catch((reason) => new Error(reason))

  const loadCryptoKey = async (method: 'encrypt' | 'decrypt') => {
    const keyMaterial = await lazyLoadedKeyMaterial
    if (keyMaterial instanceof Error) throw keyMaterial
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('connect-mongo'),
        iterations: 100000,
        hash: 'SHA-512',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      [method]
    )
    return key
  }

  return {
    async encrypt(payload) {
      const encoder = new TextEncoder()
      const data = encoder.encode(payload)
      const key = await loadCryptoKey('encrypt')
      const iv = crypto.getRandomValues(new Uint8Array(16))
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        key,
        data
      )
      const result = new Uint8Array(iv.length + encrypted.byteLength)
      result.set(iv, 0)
      result.set(new Uint8Array(encrypted), iv.length)
      return Buffer.from(result).toString('base64')
    },
    async decrypt(encryptedPayload) {
      const decoder = new TextDecoder()
      const data = Buffer.from(encryptedPayload, 'base64')
      const iv = data.subarray(0, 16)
      const encrypted = data.subarray(16)
      const key = await loadCryptoKey('decrypt')
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, tagLength: 128 },
        key,
        encrypted
      )
      return decoder.decode(decrypted)
    },
  }
}

export default createWebCryptoAdapter
