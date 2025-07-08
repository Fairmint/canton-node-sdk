# Canton Node SDK

A simple TypeScript SDK with strict linting and comprehensive testing.

## Features

- 🚀 TypeScript with strict configuration
- 🔍 ESLint with strict TypeScript rules
- 💅 Prettier for consistent code formatting
- 🧪 Jest for unit testing with coverage
- 📦 Built-in type declarations

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn

## Installation

```bash
npm install
```

## Development

### Build the project

```bash
npm run build
```

### Watch mode for development

```bash
npm run dev
```

### Run tests

```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Linting and Formatting

```bash
# Check for linting issues
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Format code with Prettier
npm run format

# Check if code is properly formatted
npm run format:check
```

## Usage

```typescript
import { sayHello, sayHelloFormal } from 'canton-node-sdk';

// Simple greeting
const greeting = sayHello('World');
console.log(greeting); // "Hello, World!"

// Formal greeting
const formalGreeting = sayHelloFormal('Smith', 'Dr.');
console.log(formalGreeting); // "Greetings, Dr. Smith!"
```

## Project Structure

```
canton-node-sdk/
├── src/
│   ├── index.ts          # Main SDK functions
│   └── index.test.ts     # Unit tests
├── dist/                 # Compiled output (generated)
├── coverage/             # Test coverage reports (generated)
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── .eslintrc.js          # ESLint configuration
├── .prettierrc           # Prettier configuration
├── jest.config.js        # Jest configuration
└── README.md             # This file
```

## Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run dev` - Watch mode for development
- `npm test` - Run unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Check for linting issues
- `npm run lint:fix` - Fix linting issues automatically
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check if code is properly formatted
- `npm run clean` - Remove dist directory

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Run linting: `npm run lint`
6. Format code: `npm run format`
7. Submit a pull request

## License

MIT 