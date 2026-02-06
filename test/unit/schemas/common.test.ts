import {
  ApiFeaturesSchema,
  DeduplicationDurationSchema,
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
