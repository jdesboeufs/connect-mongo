'use strict'

const options = {
  secret: 'squirrel',
}

const phrases = [
  'Secret Squirrel',
  'écureuil secret',
  'गुप्त गिलहरी',
  'ਗੁਪਤ ਗਿੱਠੀ',
  'veverița secretă',
  'секретная белка',
  'leyndur íkorna',
  'السنجاب السري',
  'գաղտնի սկյուռ',
  'feòrag dìomhair',
  'গোপন কাঠবিড়ালি',
  '秘密のリス',
  'таемная вавёрка',
]

const kruptein = require('kruptein')(options)

describe('kruptein', () => {
  let ct, pt

  it('Encrypt data', done => {
    kruptein.set(
      options.secret,
      '123, easy as ABC. ABC, easy as 123',
      (err, ciphertext) => {
        expect(err).toBeFalsy()

        ct = JSON.parse(ciphertext)

        expect(ct).toHaveProperty('ct')
        expect(ct).toHaveProperty('iv')
        expect(ct).toHaveProperty('hmac')
        done()
      }
    )
  })

  it('Encrypt data (missing secret)', done => {
    kruptein.set('', JSON.stringify(ct), (err, plaintext) => {
      expect(err).toMatch(/Must supply a secret!/)
      expect(plaintext).toBeFalsy()
      done()
    })
  })

  it('Decrypt data', done => {
    kruptein.get(options.secret, JSON.stringify(ct), (err, plaintext) => {
      expect(err).toBeFalsy()

      pt = plaintext

      expect(pt).toMatch(/123, easy as ABC. ABC, easy as 123/)
      done()
    })
  })

  it('Decrypt data (missing secret)', done => {
    kruptein.get('', JSON.stringify(ct), (err, plaintext) => {
      expect(err).toMatch(/Must supply a secret!/)
      expect(plaintext).toBeFalsy()
      done()
    })
  })

  it('Decrypt data (invalid ciphertext)', done => {
    kruptein.get(
      options.secret,
      JSON.stringify(ct) + 'aaa',
      (err, plaintext) => {
        expect(err).toMatch(/Unable to parse ciphertext object!/)
        expect(plaintext).toBeFalsy()
        done()
      }
    )
  })

  it('HMAC validation', done => {
    ct.hmac = 'funky chicken'
    ct = JSON.stringify(ct)

    kruptein.get(options.secret, ct, (err, ciphertext) => {
      expect(err).toMatch(/Encrypted session was tampered with/)
      expect(ciphertext).toBeFalsy()
      done()
    })
  })

  it('Key Derivation (pbkdf2)', done => {
    const opts = {
      hashing: 'w00t',
    }
    const tmp = require('kruptein')(opts)

    tmp._derive_key(options.secret, (err, res) => {
      expect(err).toMatch(/Unable to derive key!/)
      expect(res).toBeFalsy()
    })

    done()
  })

  it('Key Derivation (scrypt)', done => {
    const opts = {
      use_scrypt: true,
    }
    const scryptLimits = {
      N: 2 ** 16,
      p: 1,
      r: 1,
    }
    const tmp = require('kruptein')(opts)

    tmp._derive_key(
      { secret: options.secret, opts: scryptLimits },
      (err, res) => {
        if (typeof require('crypto').scryptSync === 'function') {
          expect(err).toMatch(/Unable to derive key!/)
          expect(res).toBeFalsy()
        } else {
          expect(Buffer.byteLength(res.key)).toEqual(tmp._key_size)
          expect(err).toBeFalsy()
        }
      }
    )

    done()
  })

  for (const phrase in phrases) {
    it('Validate Plaintext ("' + phrases[phrase] + '")', done => {
      let ct

      kruptein.set(options.secret, phrases[phrase], (err, res) => {
        expect(err).toBeFalsy()

        res = JSON.parse(res)

        expect(res).toHaveProperty('ct')
        expect(res).toHaveProperty('iv')
        expect(res).toHaveProperty('hmac')

        if (kruptein._aead_mode) expect(res).toHaveProperty('at')

        ct = res
      })

      ct = JSON.stringify(ct)

      kruptein.get(options.secret, ct, (err, res) => {
        expect(err).toBeFalsy()
        expect(res).toMatch(phrases[phrase])
      })

      done()
    })
  }
})
