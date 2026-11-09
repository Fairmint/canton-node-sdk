import { CantonError, type ErrorContext } from '../errors';

/** Error code of {@link LossyJsonError}. */
export const LOSSY_JSON_ERROR_CODE = 'LOSSY_JSON';

/**
 * Thrown when `JSON.parse` would not keep every value of a JSON text: a number that does not survive the conversion to
 * a JavaScript number exactly as written (an integer JavaScript cannot hold, such as `9007199254740993` or
 * `9223372036854775000`, or a rewritten form such as `1.0` or `1e3`), or an object that repeats a key (the later value
 * would silently replace the earlier one).
 */
export class LossyJsonError extends CantonError {
  public override readonly name: string;

  constructor(message: string, context?: ErrorContext) {
    super(message, LOSSY_JSON_ERROR_CODE, context);
    this.name = 'LossyJsonError';
  }
}

interface Container {
  readonly keys: Set<string> | undefined;
  expectKey: boolean;
  /** The last key read in this object. Only tracked for the root object, to find the array under a given key. */
  lastKey: string | undefined;
  /** For the array whose elements are being recorded: the elements found so far. */
  readonly elements: string[] | undefined;
  /** For that array: where the element being read starts. */
  elementStart: number | undefined;
}

const MAX_TOKEN_IN_MESSAGE = 80;

function excerpt(token: string): string {
  return token.length > MAX_TOKEN_IN_MESSAGE ? `${token.slice(0, MAX_TOKEN_IN_MESSAGE)}...` : token;
}

/** Index just past the string token that starts at `start` (the opening quote). */
function endOfString(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length) {
    const char = text.charCodeAt(index);
    if (char === 0x5c /* \ */) {
      index += 2;
    } else if (char === 0x22 /* " */) {
      return index + 1;
    } else {
      index += 1;
    }
  }
  return index;
}

function isNumberChar(char: number): boolean {
  return (
    (char >= 0x30 && char <= 0x39) /* 0-9 */ ||
    char === 0x2d /* - */ ||
    char === 0x2b /* + */ ||
    char === 0x2e /* . */ ||
    char === 0x65 /* e */ ||
    char === 0x45 /* E */
  );
}

function isIntegerToken(token: string): boolean {
  return !token.includes('.') && !token.includes('e') && !token.includes('E');
}

/**
 * Whether `JSON.parse` reads the number token as exactly the number written, in the form written: JavaScript writes the
 * parsed number back as the same text, and, for an integer, the parsed number is that very integer. The second check
 * matters above 2^53, where JavaScript writes some integers it cannot hold with the trailing zeros they were written
 * with (`9223372036854775000` parses to 9223372036854774784 but is written back as `9223372036854775000`). The first
 * rejects an integer JavaScript holds but writes differently (`1152921504606846976`, 2^60, is written back as
 * `1152921504606847000`), so that serializing the parsed value never changes a number either.
 */
function isExactNumber(token: string): boolean {
  const parsed = Number(token);
  // A finite number is written back without `Infinity`, so `BigInt(parsed)` below cannot throw.
  if (String(parsed) !== token) return false;
  return !isIntegerToken(token) || BigInt(parsed) === BigInt(token);
}

/** What JavaScript makes of the token: the integer it holds when that differs from the one written, else its text. */
function describeParsed(token: string): string {
  const parsed = Number(token);
  if (isIntegerToken(token) && Number.isFinite(parsed) && BigInt(parsed) !== BigInt(token)) {
    return BigInt(parsed).toString();
  }
  return String(parsed);
}

/** Whether the character can start a JSON value. */
function startsValue(char: number): boolean {
  return (
    char === 0x22 /* " */ ||
    char === 0x7b /* { */ ||
    char === 0x5b /* [ */ ||
    char === 0x2d /* - */ ||
    (char >= 0x30 && char <= 0x39) /* 0-9 */ ||
    char === 0x74 /* t */ ||
    char === 0x66 /* f */ ||
    char === 0x6e /* n */
  );
}

/**
 * Walks `text` (valid JSON), throwing a {@link LossyJsonError} for the first number or repeated key that `JSON.parse`
 * would not keep. With `rootArrayKey`, it also returns the exact text of each element of the array the root object
 * holds under that key (`undefined` when there is no such array).
 */
function scanLosslessJson(text: string, rootArrayKey: string | undefined): string[] | undefined {
  const stack: Container[] = [];
  let rootArrayElements: string[] | undefined;
  // Index just past the last character of the last token read (a string, number, literal or bracket).
  let tokenEnd = 0;
  let index = 0;
  while (index < text.length) {
    const char = text.charCodeAt(index);
    const top = stack[stack.length - 1];
    if (top?.elements !== undefined) {
      if (top.elementStart === undefined && startsValue(char)) {
        top.elementStart = index;
      } else if (top.elementStart !== undefined && (char === 0x2c || char === 0x5d) /* , or ] */) {
        top.elements.push(text.slice(top.elementStart, tokenEnd));
        top.elementStart = undefined;
      }
    }
    if (char === 0x22 /* " */) {
      const end = endOfString(text, index);
      if (top?.keys !== undefined && top.expectKey) {
        const key: unknown = JSON.parse(text.slice(index, end));
        if (typeof key === 'string') {
          if (top.keys.has(key)) {
            throw new LossyJsonError(`JSON object repeats the key "${excerpt(key)}"`, { key, position: index });
          }
          top.keys.add(key);
          if (stack.length === 1) top.lastKey = key;
        }
        top.expectKey = false;
      }
      index = end;
    } else if (char === 0x7b /* { */) {
      stack.push({
        keys: new Set<string>(),
        expectKey: true,
        lastKey: undefined,
        elements: undefined,
        elementStart: undefined,
      });
      index += 1;
    } else if (char === 0x5b /* [ */) {
      // The array the root object holds under `rootArrayKey` records its elements.
      const recorded =
        rootArrayKey !== undefined && stack.length === 1 && top?.keys !== undefined && top.lastKey === rootArrayKey;
      const elements = recorded ? [] : undefined;
      if (elements !== undefined) rootArrayElements = elements;
      stack.push({ keys: undefined, expectKey: false, lastKey: undefined, elements, elementStart: undefined });
      index += 1;
    } else if (char === 0x7d /* } */ || char === 0x5d /* ] */) {
      stack.pop();
      index += 1;
    } else if (char === 0x2c /* , */) {
      if (top?.keys !== undefined) top.expectKey = true;
      index += 1;
      continue;
    } else if (char === 0x2d /* - */ || (char >= 0x30 && char <= 0x39) /* 0-9 */) {
      let end = index + 1;
      while (end < text.length && isNumberChar(text.charCodeAt(end))) end += 1;
      const token = text.slice(index, end);
      if (!isExactNumber(token)) {
        throw new LossyJsonError(
          `JSON number ${excerpt(token)} does not survive JSON.parse exactly (it reads back as ${excerpt(describeParsed(token))})`,
          { token: excerpt(token), position: index }
        );
      }
      index = end;
    } else if (char === 0x74 /* t */ || char === 0x6e /* n */) {
      // true, null
      index += 4;
    } else if (char === 0x66 /* f */) {
      // false
      index += 5;
    } else {
      // Whitespace and ':'.
      index += 1;
      continue;
    }
    tokenEnd = index;
  }
  return rootArrayElements;
}

/**
 * Checks that `JSON.parse(text)` keeps every value written in `text`: each number token parses to exactly the number
 * written, in the form JavaScript writes it back (so no digit is lost or rewritten), and no object repeats a key.
 * `text` must already be valid JSON.
 *
 * Object key order is not checked: JavaScript lists integer-like keys first, so a consumer that needs the exact bytes
 * keeps the text itself.
 *
 * @throws LossyJsonError naming the first number or repeated key that would not survive
 */
export function assertLosslessJson(text: string): void {
  scanLosslessJson(text, undefined);
}

/**
 * `JSON.parse(text)` after {@link assertLosslessJson}: every number in the result equals the number written in `text`,
 * and no key was dropped.
 *
 * @throws SyntaxError if `text` is not JSON
 * @throws LossyJsonError if parsing would change or drop a value
 */
export function parseJsonLosslessly(text: string): unknown {
  const value: unknown = JSON.parse(text);
  assertLosslessJson(text);
  return value;
}

/** {@link parseJsonLosslessly}'s value, and the exact text of each element of one array of the root object. */
export interface LosslessJsonWithElements {
  /** `JSON.parse(text)`, checked by {@link assertLosslessJson}. */
  readonly value: unknown;
  /**
   * The elements of the array the root object holds under the requested key, each exactly as written in the text
   * (`text.slice` of the element, without the whitespace around it); `undefined` when the root is not an object or that
   * key does not hold an array.
   */
  readonly elements: readonly string[] | undefined;
}

/**
 * {@link parseJsonLosslessly}, also returning the exact text of each element of the array that the root object holds
 * under `key`, e.g. each update of a `{ "updates": [ ... ] }` page, so that each can be stored as the bytes received.
 *
 * @throws SyntaxError if `text` is not JSON
 * @throws LossyJsonError if parsing would change or drop a value
 */
export function parseJsonLosslesslyWithElements(text: string, key: string): LosslessJsonWithElements {
  const value: unknown = JSON.parse(text);
  const elements = scanLosslessJson(text, key);
  return { value, elements };
}
