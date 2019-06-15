module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', 'src'],
  collectCoverageFrom: ['src/**/*.js', '!**/test/**', '!*.js'],
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.js'],
}
