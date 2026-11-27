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
    // ESM-only dependencies (see transformIgnorePatterns) are compiled to CommonJS for Jest, file by file. Node loads
    // them at run time through require(esm) (engines.node >=22.12.0); Jest's CommonJS runtime cannot.
    '^.+\\.js$': [
      'ts-jest',
      {
        tsconfig: {
          allowJs: true,
          esModuleInterop: true,
          isolatedModules: true,
          module: 'commonjs',
          skipLibCheck: true,
          target: 'ES2022',
        },
      },
    ],
  },
  // Transform only the ESM-only packages: @fairmint/canton-protocol and the @noble/hashes it pins (2.x ships ESM
  // only). Its other dependencies (@canton-network/core-tx-hashing, @canton-network/core-ledger-proto, @protobuf-ts/*)
  // publish CommonJS and load untransformed.
  transformIgnorePatterns: ['/node_modules/(?!(@fairmint/canton-protocol|@noble/hashes)/)'],
  // LocalNet helpers from @fairmint/canton-dev-tools peer on this package; map SDK
  // imports to workspace source so branded types match local changes. Map the
  // Dev Tools testing subpath explicitly — classic TS resolution ignores exports.
  moduleNameMapper: {
    '^@fairmint/canton-node-sdk$': '<rootDir>/src/index.ts',
    '^@fairmint/canton-node-sdk/(.*)$': '<rootDir>/src/$1',
    '^@fairmint/canton-dev-tools/testing$': '<rootDir>/node_modules/@fairmint/canton-dev-tools/dist/testing/index.js',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/**/*.test.ts', '!src/**/*.spec.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Default timeout for integration tests against LocalNet
  testTimeout: 60000,
};
