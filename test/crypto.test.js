'use strict'

const Crypto = require('../src/crypto.js')

const options = {
  secret: 'squirrel',
}

Crypto.init(options)

let hmac

describe('Crypto', () => {
  let ct, pt

  it('Encrypt data', () => {
    return new Promise((resolve) => {
      ct = JSON.parse(Crypto.set('123, easy as ABC. ABC, easy as 123'))
      expect(ct).toHaveProperty('ct')
      expect(ct).toHaveProperty('iv')
      expect(ct).toHaveProperty('hmac')
      resolve()
    })
  })

  it('Decrypt data', () => {
    return new Promise((resolve) => {
      pt = Crypto.get(JSON.stringify(ct))
      expect(pt).toMatch(/123, easy as ABC. ABC, easy as 123/)
      resolve()
    })
  })

  it('HMAC validation', () => {
    return new Promise((resolve) => {
      hmac = ct.hmac
      ct.hmac = 'funky chicken'
      ct = JSON.stringify(ct)
      expect(() => {
        pt = Crypto.get(ct)
      }).toThrow(/Encrypted session was tampered with/)
      resolve()
    })
  })

  it('Authentication tag validation', () => {
    return new Promise((resolve) => {
      ct = JSON.parse(ct)
      ct.hmac = hmac

      if (!ct.at) resolve()

      ct.at = 'funky chicken'
      ct = JSON.stringify(ct)
      expect(() => {
        pt = Crypto.get(ct)
      }).toThrow(/Unsupported state or unable to authenticate data/)
      resolve()
    })
  })

  it('Additional authentication data validation', () => {
    return new Promise((resolve) => {
      ct = JSON.parse(ct)

      if (!ct.aad) resolve()

      ct.aad = 'funky chicken'
      ct = JSON.stringify(ct)
      expect(() => {
        pt = Crypto.get(ct)
      }).toThrow(/Unsupported state or unable to authenticate data/)
      resolve()
    })
  })
})
