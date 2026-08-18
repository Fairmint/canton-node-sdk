import { CantonError, type ErrorContext } from '../../../core/errors';

export const TokenStandardV1ResultErrorCode = {
  RESULT_NOT_FOUND: 'TOKEN_STANDARD_V1_RESULT_NOT_FOUND',
  RESULT_INVALID: 'TOKEN_STANDARD_V1_RESULT_INVALID',
} as const;

export type TokenStandardV1ResultErrorCode =
  (typeof TokenStandardV1ResultErrorCode)[keyof typeof TokenStandardV1ResultErrorCode];

/** Thrown when a transaction does not contain the token standard V1 result a reader was asked for, or it is malformed. */
export class TokenStandardV1ResultError extends CantonError {
  public override readonly name: string;

  public constructor(code: TokenStandardV1ResultErrorCode, message: string, context?: ErrorContext) {
    super(message, code, context);
    this.name = 'TokenStandardV1ResultError';
  }
}
