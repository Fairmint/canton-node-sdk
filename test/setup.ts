// Test setup for unit tests
import dotenv from 'dotenv';

// Load environment variables for tests
dotenv.config({ path: '.env.test' });

// Global test configuration
beforeAll(() => {
  // Set up any global test configuration
  console.log('🧪 Starting unit tests...');
});

afterAll(() => {
  // Clean up any global test resources
  console.log('✅ Unit tests completed');
});

// Increase timeout for all tests
jest.setTimeout(30000);
