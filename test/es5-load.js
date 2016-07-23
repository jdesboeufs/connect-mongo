'use strict';

describe('Transpiled-to-ES5 version', function () {
  it('should load with success', function () {
    const session = require('express-session');
    require('../es5')(session);
  });
});
