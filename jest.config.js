/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/server/payment/__tests__/**/*.test.js'],
  transform: {},
  moduleNameMapper: {},
  testTimeout: 10000,
}
