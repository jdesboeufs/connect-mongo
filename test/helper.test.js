'use strict'

const { mergeMongoOptions } = require('../src/helper')

describe('mergeMongoOptions', () => {
  test('passing null/undefined as options should get default value', () => {
    expect(mergeMongoOptions(null)).toEqual({
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    expect(mergeMongoOptions(undefined)).toEqual({
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
  })

  test('passing false value as options override default value', () => {
    expect(
      mergeMongoOptions({ useNewUrlParser: false, useUnifiedTopology: false })
    ).toEqual({
      useNewUrlParser: false,
      useUnifiedTopology: false,
    })
  })

  test('passing extra options override should work', () => {
    expect(
      mergeMongoOptions({ useNewUrlParser: false, extraOpt: 123 })
    ).toEqual({
      useNewUrlParser: false,
      useUnifiedTopology: true,
      extraOpt: 123,
    })
  })
})
