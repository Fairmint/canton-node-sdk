/**
 * A simple hello world function
 * @param name - The name to greet
 * @returns A greeting message
 */
export function sayHello(name: string): string {
  return `Hello, ${name}!`;
}

/**
 * A more formal greeting function
 * @param name - The name to greet
 * @param title - Optional title for the person
 * @returns A formal greeting message
 */
export function sayHelloFormal(name: string, title?: string): string {
  const prefix = title ? `${title} ` : '';
  return `Greetings, ${prefix}${name}!`;
}
