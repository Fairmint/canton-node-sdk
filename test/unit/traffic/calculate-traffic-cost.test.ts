import {
  calculateTrafficCostInCents,
  calculateTrafficCostInDollars,
  DEFAULT_PRICE_PER_MB_CENTS,
  UPDATE_CONFIRMATION_OVERHEAD_BYTES,
} from '../../../src/utils/traffic/types';

describe('traffic cost calculation helpers', () => {
  describe('constants', () => {
    it('should have correct default price per MB', () => {
      expect(DEFAULT_PRICE_PER_MB_CENTS).toBe(6000); // $60/MB
    });

    it('should have correct update confirmation overhead', () => {
      expect(UPDATE_CONFIRMATION_OVERHEAD_BYTES).toBe(5 * 1024); // 5KB
    });
  });

  describe('calculateTrafficCostInCents', () => {
    it('should calculate cost for 55KB at $60/MB (example from docs)', () => {
      // Formula: 6000 * 55 / 1024 ≈ 322.27 cents
      const bytes = 55 * 1024;
      const result = calculateTrafficCostInCents(bytes);
      expect(result).toBeCloseTo(322.27, 1);
    });

    it('should calculate cost for 1MB', () => {
      const bytes = 1024 * 1024; // 1MB
      const result = calculateTrafficCostInCents(bytes);
      expect(result).toBe(6000); // $60
    });

    it('should return 0 for 0 bytes', () => {
      expect(calculateTrafficCostInCents(0)).toBe(0);
    });

    it('should accept custom price per MB', () => {
      const bytes = 1024 * 1024; // 1MB
      const customPrice = 10000; // $100/MB
      expect(calculateTrafficCostInCents(bytes, customPrice)).toBe(10000);
    });

    it('should handle small amounts of bytes', () => {
      const bytes = 1024; // 1KB
      // 6000 * 1024 / (1024 * 1024) = 6000 / 1024 ≈ 5.86 cents
      const result = calculateTrafficCostInCents(bytes);
      expect(result).toBeCloseTo(5.86, 1);
    });
  });

  describe('calculateTrafficCostInDollars', () => {
    it('should calculate cost for 55KB at $60/MB (example from docs)', () => {
      const bytes = 55 * 1024;
      const result = calculateTrafficCostInDollars(bytes);
      expect(result).toBeCloseTo(3.22, 2);
    });

    it('should calculate cost for 1MB', () => {
      const bytes = 1024 * 1024; // 1MB
      const result = calculateTrafficCostInDollars(bytes);
      expect(result).toBe(60); // $60
    });

    it('should return 0 for 0 bytes', () => {
      expect(calculateTrafficCostInDollars(0)).toBe(0);
    });

    it('should accept custom price per MB', () => {
      const bytes = 1024 * 1024; // 1MB
      const customPrice = 10000; // $100/MB
      expect(calculateTrafficCostInDollars(bytes, customPrice)).toBe(100);
    });
  });
});
