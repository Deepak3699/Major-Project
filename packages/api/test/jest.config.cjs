module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/..'],
  testMatch: ['**/test/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    '../src/**/*.ts',
    '!../src/**/*.d.ts',
    '!../src/server.ts'
  ],
  coverageDirectory: '../coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
  setupFiles: ['./setup.ts'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/../src/$1'
  },
  testTimeout: 30000,
};
