'use strict';
const legacyTests = require('./legacy-tests');

describe('Legacy tests', function () {
  this.timeout(6000);
  Object.keys(legacyTests).forEach(testName => {
    it(testName, legacyTests[testName]);
  });
});
