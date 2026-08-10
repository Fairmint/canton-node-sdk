module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  // LocalNet helpers from @fairmint/canton-dev-tools peer on this package; map to
  // workspace source so branded types and runtime clients match local changes.
  moduleNameMapper: {
    '^@fairmint/canton-node-sdk$': '<rootDir>/src/index.ts',
    '^@fairmint/canton-node-sdk/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.test.ts', '!src/**/*.spec.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Default timeout for integration tests against LocalNet
  testTimeout: 60000,
};
