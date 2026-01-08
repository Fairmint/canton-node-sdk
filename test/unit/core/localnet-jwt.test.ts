import { createLocalnetTokenGenerator, generateLocalnetJwt } from '../../../src/core/auth/localnet-jwt';

describe('localnet-jwt', () => {
  describe('generateLocalnetJwt', () => {
    it('should generate a valid JWT with default options', () => {
      const jwt = generateLocalnetJwt();

      // JWT should have 3 parts separated by dots
      const parts = jwt.split('.');
      expect(parts.length).toBe(3);

      // Decode and verify header
      const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString());
      expect(header.alg).toBe('HS256');
      expect(header.typ).toBe('JWT');

      // Decode and verify payload
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
      expect(payload.sub).toBe('ledger-api-user');
      expect(payload.aud).toBe('https://canton.network.global');
      expect(payload.iss).toBe('unsafe-auth');
      expect(payload.iat).toBeDefined();
      expect(payload.exp).toBeDefined();
      expect(payload.exp - payload.iat).toBe(3600); // 1 hour expiry
    });

    it('should respect custom options', () => {
      const jwt = generateLocalnetJwt({
        userId: 'custom-user',
        audience: 'custom-audience',
        expirySeconds: 7200,
      });

      const parts = jwt.split('.');
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());

      expect(payload.sub).toBe('custom-user');
      expect(payload.aud).toBe('custom-audience');
      expect(payload.exp - payload.iat).toBe(7200);
    });
  });

  describe('createLocalnetTokenGenerator', () => {
    it('should create a function that generates JWTs', async () => {
      const generator = createLocalnetTokenGenerator();
      const jwt = await generator();

      // JWT should have 3 parts separated by dots
      const parts = jwt.split('.');
      expect(parts.length).toBe(3);
    });

    it('should pass options to the JWT generator', async () => {
      const generator = createLocalnetTokenGenerator({
        userId: 'test-user',
      });
      const jwt = await generator();

      const parts = jwt.split('.');
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
      expect(payload.sub).toBe('test-user');
    });
  });
});
