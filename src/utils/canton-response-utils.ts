import { OperationError, OperationErrorCode } from '../core/errors';
import { isRecord } from '../core/utils';

export function readRequiredString(source: unknown, key: string, operation: string): string {
  if (isRecord(source) && key in source) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  throw new OperationError(
    `Canton ${operation} response did not include ${key}`,
    OperationErrorCode.TRANSACTION_FAILED
  );
}

export function objectOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
