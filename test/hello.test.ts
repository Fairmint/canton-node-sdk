import { sayHello, sayHelloFormal } from '../src/index';

describe('sayHello', () => {
  it('should return a greeting with the provided name', (): void => {
    const result = sayHello('World');
    expect(result).toBe('Hello, World!');
  });

  it('should handle empty string', (): void => {
    const result = sayHello('');
    expect(result).toBe('Hello, !');
  });

  it('should handle special characters', (): void => {
    const result = sayHello('John Doe');
    expect(result).toBe('Hello, John Doe!');
  });
});

describe('sayHelloFormal', () => {
  it('should return a formal greeting with name only', (): void => {
    const result = sayHelloFormal('World');
    expect(result).toBe('Greetings, World!');
  });

  it('should return a formal greeting with title and name', (): void => {
    const result = sayHelloFormal('Smith', 'Dr.');
    expect(result).toBe('Greetings, Dr. Smith!');
  });

  it('should handle empty name', (): void => {
    const result = sayHelloFormal('');
    expect(result).toBe('Greetings, !');
  });

  it('should handle empty title', (): void => {
    const result = sayHelloFormal('John', '');
    expect(result).toBe('Greetings, John!');
  });

  it('should handle both empty title and name', (): void => {
    const result = sayHelloFormal('', '');
    expect(result).toBe('Greetings, !');
  });
});
