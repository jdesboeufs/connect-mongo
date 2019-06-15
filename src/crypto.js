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
    this.secret = this._derive_key(options.secret) || false
  }

  set(plaintext) {
    let iv = this.crypto.randomBytes(this.iv_size).toString(this.encodeas),
      aad = this._digest(
        iv + this.secret,
        JSON.stringify(plaintext),
        this.hashing,
        this.encodeas
      ),
      ct = this._encrypt(
        this.secret,
        JSON.stringify(plaintext),
        this.algorithm,
        this.encodeas,
        iv,
        aad
      ),
      hmac = this._digest(this.secret, ct.ct, this.hashing, this.encodeas)

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
    let ct, hmac, pt, sid, session

    if (ciphertext) {
      try {
        ct = JSON.parse(ciphertext)
      } catch (err) {
        ct = ciphertext
      }
    }

    hmac = this._digest(this.secret, ct.ct, this.hashing, this.encodeas)

    if (hmac != ct.hmac) {
      throw 'Encrypted session was tampered with!'
    }

    if (ct.at) {
      ct.at = Buffer.from(ct.at)
    }

    pt = this._decrypt(
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
    let cipher = this.crypto.createCipheriv(algo, key, iv, {
        authTagLength: this.at_size,
      }),
      ct,
      at

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

    return at ? {ct, at} : {ct}
  }

  _decrypt(key, ct, algo, encodeas, iv, at, aad) {
    let cipher = this.crypto.createDecipheriv(algo, key, iv),
      pt

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

  _derive_key(secret) {
    let key, hash, salt

    hash = this.crypto.createHash(this.hashing)
    hash.update(secret)
    salt = hash.digest(this.encodeas).substr(0, 16)

    key = this.crypto.pbkdf2Sync(secret, salt, 10000, 64, this.hashing)

    return key.toString(this.encodeas).substr(0, this.key_size)
  }
}

module.exports = new Crypto()
