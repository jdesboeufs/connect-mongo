import test from 'ava'
import createKrupteinAdapter from './createKrupteinAdapter'
import { makeDataNoCookie } from '../test/testHelper'

test('should create adapter with secret', (t) => {
  const adapter = createKrupteinAdapter({ secret: 'test-secret' })
  t.is(typeof adapter, 'object')
  t.is(typeof adapter.encrypt, 'function')
  t.is(typeof adapter.decrypt, 'function')
})

test('should encrypt and decrypt complex object', async (t) => {
  const adapter = createKrupteinAdapter({ secret: 'test-secret' })
  const payload = makeDataNoCookie()
  const encrypted = await adapter.encrypt(JSON.stringify(payload))
  const decrypted = JSON.parse(await adapter.decrypt(encrypted))
  t.deepEqual(decrypted, payload)
})

test('should produce different encrypted output each time', async (t) => {
  const adapter = createKrupteinAdapter({ secret: 'test-secret' })
  const payload = { foo: 'bar' }
  const encrypted1 = await adapter.encrypt(JSON.stringify(payload))
  const encrypted2 = await adapter.encrypt(JSON.stringify(payload))
  t.not(encrypted1, encrypted2)
})

test('should decrypt both encrypted payloads to same value', async (t) => {
  const adapter = createKrupteinAdapter({ secret: 'test-secret' })
  const payload = { foo: 'bar' }
  const encrypted1 = await adapter.encrypt(JSON.stringify(payload))
  const encrypted2 = await adapter.encrypt(JSON.stringify(payload))
  const decrypted1 = JSON.parse(await adapter.decrypt(encrypted1))
  const decrypted2 = JSON.parse(await adapter.decrypt(encrypted2))
  t.deepEqual(decrypted1, payload)
  t.deepEqual(decrypted2, payload)
  t.deepEqual(decrypted1, decrypted2)
})

test('should fail to decrypt with different secret', async (t) => {
  const adapter1 = createKrupteinAdapter({ secret: 'secret-1' })
  const adapter2 = createKrupteinAdapter({ secret: 'secret-2' })
  const payload = { foo: 'bar' }
  const encrypted = await adapter1.encrypt(JSON.stringify(payload))
  await t.throwsAsync(async () => {
    await adapter2.decrypt(encrypted)
  })
})

test('should produce base64 encoded output', async (t) => {
  const adapter = createKrupteinAdapter({ secret: 'test-secret' })
  const payload = { foo: 'bar' }
  const encrypted = await adapter.encrypt(JSON.stringify(payload))
  t.regex(encrypted, /^[A-Za-z0-9+/]+=*$/)
})

test('should fail to decrypt invalid base64', async (t) => {
  const adapter = createKrupteinAdapter({ secret: 'test-secret' })
  await t.throwsAsync(async () => {
    await adapter.decrypt('not-valid-encrypted-data!!!')
  })
})

test('should fail to decrypt corrupted data', async (t) => {
  const adapter = createKrupteinAdapter({ secret: 'test-secret' })
  const payload = { foo: 'bar' }
  const encrypted = await adapter.encrypt(JSON.stringify(payload))
  const corrupted = encrypted.slice(0, -5) + 'AAAAA'
  await t.throwsAsync(async () => {
    await adapter.decrypt(corrupted)
  })
})
