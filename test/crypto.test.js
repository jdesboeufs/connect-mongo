'use strict'

const expect = require('expect.js')
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
    expect(ct).to.have.property('ct')
    expect(ct).to.have.property('iv')
    expect(ct).to.have.property('hmac')
    done()
  })

  it('Decrypt data', done => {
    pt = Crypto.get(JSON.stringify(ct))
    expect(pt).to.match(/123, easy as ABC. ABC, easy as 123/)
    done()
  })

  it('HMAC validation', done => {
    hmac = ct.hmac
    ct.hmac = 'funky chicken'
    ct = JSON.stringify(ct)

    try {
      pt = Crypto.get(ct)
    } catch (err) {
      expect(err).to.match(/Encrypted session was tampered with/)
    }
    done()
  })

  it('Authentication tag validation', done => {
    ct = JSON.parse(ct)
    ct.hmac = hmac

    if (!ct.at) done()

    ct.at = 'funky chicken'
    ct = JSON.stringify(ct)

    try {
      pt = Crypto.get(ct)
    } catch (err) {
      expect(err).to.match(/Unsupported state or unable to authenticate data/)
    }
    done()
  })

  it('Additional authentication data validation', done => {
    ct = JSON.parse(ct)

    if (!ct.aad) done()

    ct.aad = 'funky chicken'
    ct = JSON.stringify(ct)

    try {
      pt = Crypto.get(ct)
    } catch (err) {
      expect(err).to.match(/Unsupported state or unable to authenticate data/)
    }
    done()
  })
})
