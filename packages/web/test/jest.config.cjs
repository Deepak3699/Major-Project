module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  rootDir: '../',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.tsx', '**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    // Jest applies these in insertion order, so the exact-match stub for the
    // Vite-only `import.meta.env` reader has to precede the catch-all alias.
    '^@/lib/env$': '<rootDir>/src/test/env-stub.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.json',
      useESM: false,
    }],
  },
  transformIgnorePatterns: ['/node_modules/(?!@tanstack)'],
};
