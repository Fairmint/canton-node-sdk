/**
 * Runtime type validation utilities
 *
 * This module re-exports validation functions from specialized modules:
 * - shapeValidators: Object shape and record validation
 * - primitiveValidators: String, number, boolean validation
 * - arrayValidators: Array validation
 * - typeGuardValidators: Type guards and null/unknown validation
 */

// Re-export shape validators
export {
  validateRecord,
  validateExactShape,
  validateShape,
} from './validators/shapeValidators';

// Re-export primitive validators
export {
  validateString,
  validateOptionalString,
  validateNumber,
  validateBoolean,
} from './validators/primitiveValidators';

// Re-export array validators
export { validateArray } from './validators/arrayValidators';

// Re-export type guard validators
export {
  validateNotUnknownOrAny,
  validateNotNull,
  isType,
} from './validators/typeGuardValidators';
