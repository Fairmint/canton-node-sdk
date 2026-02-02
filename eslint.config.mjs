import typescriptEslintPlugin from '@typescript-eslint/eslint-plugin';
import typescriptEslintParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import unusedImportsPlugin from 'eslint-plugin-unused-imports';

const eslintConfig = [
  // Global ignores (replaces .eslintignore)
  {
    ignores: [
      '**/libs/**',
      '**/build/**',
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/docs/**',
      '**/temp/**',
      '**/artifacts/**',
      '**/generated/**',
      '**/*.generated.*',
      '**/*.example.ts',
      '**/*.js',
      '**/*.mjs',
      '**/cn-quickstart/**',
    ],
  },
  // Main configuration for TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptEslintParser,
      parserOptions: {
        project: './tsconfig.lint.json',
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
      'unused-imports': unusedImportsPlugin,
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.json',
        },
        node: true,
      },
    },
    rules: {
      // TypeScript strict rules - all errors for strict typing
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/restrict-template-expressions': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/unbound-method': 'error',
      '@typescript-eslint/no-redundant-type-constituents': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'as' }],
      '@typescript-eslint/consistent-indexed-object-style': ['error', 'record'],
      '@typescript-eslint/prefer-for-of': 'error',
      '@typescript-eslint/prefer-function-type': 'error',
      '@typescript-eslint/prefer-namespace-keyword': 'error',
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/prefer-reduce-type-parameter': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'variable',
          modifiers: ['const', 'global'],
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-meaningless-void-operator': 'error',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/prefer-return-this-type': 'error',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/no-shadow': ['error', { ignoreTypeValueShadow: true }],
      '@typescript-eslint/no-array-constructor': 'error',

      // Unused imports plugin
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // Import plugin rules
      'import/order': 'off',
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'off',
      'import/no-named-as-default': 'off',

      // General JavaScript/TypeScript rules - all errors for strict enforcement
      'no-console': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'prefer-destructuring': ['error', { object: true, array: false }],
      'prefer-spread': 'error',
      'prefer-rest-params': 'error',
      'no-useless-rename': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'prefer-exponentiation-operator': 'error',
      yoda: 'error',
      'no-useless-return': 'error',
      'no-useless-computed-key': 'error',
      'no-unneeded-ternary': 'error',
      'no-lonely-if': 'error',
      'prefer-object-spread': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-throw-literal': 'error',
      'no-implicit-coercion': 'error',
      'no-return-await': 'off',
      curly: ['error', 'multi-line', 'consistent'],
      'default-case-last': 'error',
      'no-caller': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-extend-native': 'error',
      'no-iterator': 'error',
      'no-labels': 'error',
      'no-proto': 'error',
      'no-script-url': 'error',
      'no-sequences': 'error',
      radix: 'error',
      'no-shadow': 'off',
      'no-new-wrappers': 'error',
      'no-array-constructor': 'off',
    },
  },
  // Override rules for scripts, simulations, examples, and test directories
  // Only relax console logging - typing must remain strict
  {
    files: ['scripts/**/*', 'simulations/**/*', 'examples/**/*', 'test/**/*'],
    rules: {
      'no-console': 'off',
    },
  },
  // Prettier config last to override any conflicting rules
  eslintConfigPrettier,
];

export default eslintConfig;
