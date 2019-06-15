'use strict'

const Crypto = require('../src/crypto.js')

const options = {
  secret: 'squirrel',
}

Crypto.init(options)

let hmac

describe('Crypto', () => {
  let ct, pt

  it('Encrypt data', done => {
    ct = JSON.parse(Crypto.set('123, easy as ABC. ABC, easy as 123'))
    expect(ct).toHaveProperty('ct')
    expect(ct).toHaveProperty('iv')
    expect(ct).toHaveProperty('hmac')
    done()
  })

  it('Decrypt data', done => {
    pt = Crypto.get(JSON.stringify(ct))
    expect(pt).toMatch(/123, easy as ABC. ABC, easy as 123/)
    done()
  })

  it('HMAC validation', done => {
    hmac = ct.hmac
    ct.hmac = 'funky chicken'
    ct = JSON.stringify(ct)
    expect(() => {
      pt = Crypto.get(ct)
    }).toThrow(/Encrypted session was tampered with/)
    done()
  })

  it('Authentication tag validation', done => {
    ct = JSON.parse(ct)
    ct.hmac = hmac

    if (!ct.at) done()

    ct.at = 'funky chicken'
    ct = JSON.stringify(ct)
    expect(() => {
      pt = Crypto.get(ct)
    }).toThrow(/Unsupported state or unable to authenticate data/)
    done()
  })

  it('Additional authentication data validation', done => {
    ct = JSON.parse(ct)

    if (!ct.aad) done()

    ct.aad = 'funky chicken'
    ct = JSON.stringify(ct)
    expect(() => {
      pt = Crypto.get(ct)
    }).toThrow(/Unsupported state or unable to authenticate data/)
    done()
  })
})
