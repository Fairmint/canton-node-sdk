import { GetUserResponseSchema } from '../src/clients/ledger-json-api/schemas/api';
import { GetAuthenticatedUserParamsSchema } from '../src/clients/ledger-json-api/schemas/operations';

describe('GetAuthenticatedUser API', () => {
  describe('Parameter validation', () => {
    it('should validate empty parameters', () => {
      const params = {};
      const result = GetAuthenticatedUserParamsSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should validate parameters with identityProviderId', () => {
      const params = { identityProviderId: 'default' };
      const result = GetAuthenticatedUserParamsSchema.safeParse(params);
      expect(result.success).toBe(true);
    });

    it('should fail validation with invalid identityProviderId type', () => {
      const params = { identityProviderId: 123 };
      const result = GetAuthenticatedUserParamsSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });

  describe('Response validation', () => {
    it('should validate a correct response', () => {
      const response = {
        user: {
          id: 'test-user',
          primaryParty: 'test-party',
          isDeactivated: false,
          metadata: {
            resourceVersion: '1',
            annotations: { key: 'value' },
          },
          identityProviderId: 'default',
        },
      };
      const result = GetUserResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should validate a minimal response', () => {
      const response = {
        user: {
          id: 'test-user',
          isDeactivated: false,
        },
      };
      const result = GetUserResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should fail validation when user is missing', () => {
      const response = {};
      const result = GetUserResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should fail validation when user.id is missing', () => {
      const response = {
        user: {
          isDeactivated: false,
        },
      };
      const result = GetUserResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should fail validation when user.isDeactivated is missing', () => {
      const response = {
        user: {
          id: 'test-user',
        },
      };
      const result = GetUserResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });
  });
});
