import {
  ApiFeaturesSchema,
  DeduplicationDurationSchema,
  FilterSchema,
  TraceContextSchema,
} from '../../../src/clients/ledger-json-api/schemas/common';

describe('Common Schemas', () => {
  describe('TraceContextSchema', () => {
    it('validates empty trace context', () => {
      const result = TraceContextSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('validates full trace context', () => {
      const result = TraceContextSchema.safeParse({
        traceId: '1234567890abcdef',
        spanId: 'abcdef123456',
        parentSpanId: 'parent123',
        metadata: { key: 'value' },
      });
      expect(result.success).toBe(true);
    });

    it('validates partial trace context', () => {
      const result = TraceContextSchema.safeParse({
        traceId: 'abc123',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('FilterSchema', () => {
    it('validates empty filter', () => {
      const result = FilterSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('validates filter with party mappings', () => {
      const result = FilterSchema.safeParse({
        filtersByParty: {
          'alice::123': {
            cumulative: ['Splice.Amulet:Amulet'],
          },
        },
        verbose: true,
      });
      expect(result.success).toBe(true);
    });

    it('validates filter with multiple parties', () => {
      const result = FilterSchema.safeParse({
        filtersByParty: {
          'alice::123': { cumulative: ['Template1'] },
          'bob::456': { cumulative: ['Template2', 'Template3'] },
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid filter structure', () => {
      const result = FilterSchema.safeParse({
        filtersByParty: {
          party: 'invalid', // Should be an object
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('DeduplicationDurationSchema', () => {
    it('validates deduplication duration', () => {
      const result = DeduplicationDurationSchema.safeParse({
        seconds: 300,
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing seconds', () => {
      const result = DeduplicationDurationSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects non-numeric seconds', () => {
      const result = DeduplicationDurationSchema.safeParse({
        seconds: '300',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ApiFeaturesSchema', () => {
    it('validates full API features response', () => {
      const result = ApiFeaturesSchema.safeParse({
        experimental: {
          staticTime: { supported: false },
          commandInspectionService: { supported: true },
        },
        userManagement: {
          supported: true,
          maxRightsPerUser: 100,
          maxUsersPageSize: 1000,
        },
        partyManagement: {
          maxPartiesPageSize: 500,
        },
        offsetCheckpoint: {
          maxOffsetCheckpointEmissionDelay: {
            seconds: 10,
            nanos: 0,
            unknownFields: { fields: {} },
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('rejects incomplete features', () => {
      const result = ApiFeaturesSchema.safeParse({
        experimental: {
          staticTime: { supported: false },
          // Missing commandInspectionService
        },
      });
      expect(result.success).toBe(false);
    });
  });
});
