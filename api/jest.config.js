/**
 * Jest configuration for the `/api` workspace.
 *
 * Design notes that matter when adding tests:
 * - `moduleNameMapper` reproduces the `~/*` alias that `module-alias` provides at runtime
 *   (declared in `package.json` `_moduleAliases`), so `require('~/models')` resolves the same
 *   way under test as in production.
 * - `openid-client` and `openid-client/passport` are mapped to hand-written fakes in
 *   `test/__mocks__` because the real package is ESM-only and performs network discovery.
 * - `transformIgnorePatterns` whitelists the ESM-only dependencies (`jose`, `uuid`,
 *   `@langchain/langgraph`, ...) that must be run through babel rather than loaded raw.
 * - `setupFiles` loads `test/jestSetup.js` and the logger mock before any test module, so
 *   no test writes to the real log files.
 * - 30s default timeout accommodates `mongodb-memory-server` spin-up, which the project
 *   prefers over mocking MongoDB.
 *
 * Connections:
 * - run per-workspace: `cd api && npx jest <pattern>`
 */
const esModules = [
  'openid-client',
  'oauth4webapi',
  'jose',
  '@langchain/langgraph',
  '@langchain/langgraph-checkpoint',
  '@langchain/langgraph-sdk',
  '@mistralai/mistralai',
  'uuid',
].join('|');

module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  roots: ['<rootDir>'],
  coverageDirectory: 'coverage',
  maxWorkers: '50%',
  testTimeout: 30000, // 30 seconds timeout for all tests
  setupFiles: ['./test/jestSetup.js', './test/__mocks__/logger.js'],
  moduleNameMapper: {
    '~/(.*)': '<rootDir>/$1',
    '~/data/auth.json': '<rootDir>/__mocks__/auth.mock.json',
    '^openid-client/passport$': '<rootDir>/test/__mocks__/openid-client-passport.js',
    '^openid-client$': '<rootDir>/test/__mocks__/openid-client.js',
  },
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
      },
    ],
  },
  transformIgnorePatterns: [`/node_modules/(?!(${esModules})/).*/`],
};
