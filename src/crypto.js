'use strict'

class Crypto {
  init(options) {
    this.crypto = require('crypto')
    this.algorithm = options.algorithm || 'aes-256-gcm'
    this.hashing = options.hashing || 'sha512'
    this.encodeas = options.encodeas || 'hex'
    this.iv_size = options.iv_size || 16
    this.at_size = options.at_size || 16
    this.key_size = options.key_size || 32
    this.secret = this._deriveKey(options.secret) || false
  }

  set(plaintext) {
    const iv = this.crypto.randomBytes(this.iv_size).toString(this.encodeas)
    const aad = this._digest(
      iv + this.secret,
      JSON.stringify(plaintext),
      this.hashing,
      this.encodeas
    )
    const ct = this._encrypt(
      this.secret,
      JSON.stringify(plaintext),
      this.algorithm,
      this.encodeas,
      iv,
      aad
    )
    const hmac = this._digest(this.secret, ct.ct, this.hashing, this.encodeas)

    const obj = JSON.stringify({
      hmac,
      ct: ct.ct,
      at: ct.at,
      aad,
      iv,
    })

    return obj
  }

  get(ciphertext) {
    let ct

    if (ciphertext) {
      try {
        ct = JSON.parse(ciphertext)
      } catch (err) {
        ct = ciphertext
      }
    }

    const hmac = this._digest(this.secret, ct.ct, this.hashing, this.encodeas)

    if (hmac !== ct.hmac) {
      throw new Error('Encrypted session was tampered with!')
    }

    if (ct.at) {
      ct.at = Buffer.from(ct.at)
    }

    const pt = this._decrypt(
      this.secret,
      ct.ct,
      this.algorithm,
      this.encodeas,
      ct.iv,
      ct.at,
      ct.aad
    )

    return pt
  }

  _digest(key, obj, hashing, encodeas) {
    const hmac = this.crypto.createHmac(this.hashing, key)
    hmac.setEncoding(encodeas)
    hmac.write(obj)
    hmac.end()
    return hmac.read().toString(encodeas)
  }

  _encrypt(key, pt, algo, encodeas, iv, aad) {
    const cipher = this.crypto.createCipheriv(algo, key, iv, {
      authTagLength: this.at_size,
    })
    let ct
    let at

    if (aad) {
      try {
        cipher.setAAD(Buffer.from(aad), {
          plaintextLength: Buffer.byteLength(pt),
        })
      } catch (err) {
        throw err
      }
    }

    ct = cipher.update(pt, 'utf8', encodeas)
    ct += cipher.final(encodeas)

    try {
      at = cipher.getAuthTag()
    } catch (err) {
      throw err
    }

    return at ? { ct, at } : { ct }
  }

  _decrypt(key, ct, algo, encodeas, iv, at, aad) {
    const cipher = this.crypto.createDecipheriv(algo, key, iv)
    let pt

    if (at) {
      try {
        cipher.setAuthTag(Buffer.from(at))
      } catch (err) {
        throw err
      }
    }

    if (aad) {
      try {
        cipher.setAAD(Buffer.from(aad), {
          plaintextLength: Buffer.byteLength(ct),
        })
      } catch (err) {
        throw err
      }
    }

    pt = cipher.update(ct, encodeas, 'utf8')
    pt += cipher.final('utf8')

    return pt
  }

  _deriveKey(secret) {
    const hash = this.crypto.createHash(this.hashing)
    hash.update(secret)
    const salt = hash.digest(this.encodeas).substr(0, 16)

    const key = this.crypto.pbkdf2Sync(secret, salt, 10000, 64, this.hashing)

    return key.toString(this.encodeas).substr(0, this.key_size)
  }
}

module.exports = new Crypto()
