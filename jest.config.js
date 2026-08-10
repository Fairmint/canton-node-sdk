module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // Use the lint/test project so package exports + path maps resolve under TS 5.x.
        tsconfig: '<rootDir>/tsconfig.lint.json',
      },
    ],
  },
  // LocalNet helpers from @fairmint/canton-dev-tools peer on this package; map SDK
  // imports to workspace source so branded types match local changes. Map the
  // Dev Tools testing subpath explicitly — classic TS resolution ignores exports.
  moduleNameMapper: {
    '^@fairmint/canton-node-sdk$': '<rootDir>/src/index.ts',
    '^@fairmint/canton-node-sdk/(.*)$': '<rootDir>/src/$1',
    '^@fairmint/canton-dev-tools/testing$':
      '<rootDir>/node_modules/@fairmint/canton-dev-tools/dist/testing/index.js',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.test.ts', '!src/**/*.spec.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Default timeout for integration tests against LocalNet
  testTimeout: 60000,
};
