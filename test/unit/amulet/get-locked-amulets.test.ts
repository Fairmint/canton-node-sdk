import type { ValidatorApiClient } from '../../../src/clients/validator-api';
import type { GetAmuletsResponse } from '../../../src/clients/validator-api/schemas/api/wallet';
import { ValidationError } from '../../../src/core/errors';
import { getLockedAmuletsForParty } from '../../../src/utils/amulet/get-locked-amulets';

const createMockValidatorClient = (response: GetAmuletsResponse): ValidatorApiClient =>
  ({
    getAmulets: jest.fn().mockResolvedValue(response),
  }) as unknown as ValidatorApiClient;

const createLockedAmuletEntry = (
  owner: string,
  effectiveAmount: string,
  overrides: Partial<{
    contractId: string;
    templateId: string;
    holders: string[];
    expiresAt: string | null;
    domainId: string;
    createdEventBlob: string;
  }> = {}
) => ({
  effective_amount: effectiveAmount,
  round: 10,
  accrued_holding_fee: '0.001',
  contract: {
    contract: {
      template_id: overrides.templateId ?? 'pkg:Splice.Amulet:LockedAmulet',
      contract_id: overrides.contractId ?? `contract-${owner}`,
      created_event_blob: overrides.createdEventBlob ?? 'blob-123',
      created_at: '2026-01-01T00:00:00Z',
      payload: {
        amulet: { owner },
        lock: {
          holders: overrides.holders ?? [],
          expiresAt: overrides.expiresAt ?? null,
        },
      },
    },
    domain_id: overrides.domainId ?? 'domain-123',
  },
});

describe('getLockedAmuletsForParty', () => {
  it('returns locked amulets owned by the specified party', async () => {
    const mockClient = createMockValidatorClient({
      amulets: [],
      locked_amulets: [
        createLockedAmuletEntry('alice::fingerprint', '100.5'),
        createLockedAmuletEntry('bob::fingerprint', '50.0'),
      ],
    });

    const result = await getLockedAmuletsForParty(mockClient, 'alice::fingerprint');

    expect(result).toHaveLength(1);
    expect(result[0]?.owner).toBe('alice::fingerprint');
    expect(result[0]?.effectiveAmount).toBe(100.5);
  });

  it('performs case-insensitive owner matching', async () => {
    const mockClient = createMockValidatorClient({
      amulets: [],
      locked_amulets: [createLockedAmuletEntry('Alice::Fingerprint', '100.0')],
    });

    const result = await getLockedAmuletsForParty(mockClient, 'alice::fingerprint');

    expect(result).toHaveLength(1);
    expect(result[0]?.owner).toBe('Alice::Fingerprint');
  });

  it('returns empty array when no amulets match owner', async () => {
    const mockClient = createMockValidatorClient({
      amulets: [],
      locked_amulets: [createLockedAmuletEntry('bob::fingerprint', '50.0')],
    });

    const result = await getLockedAmuletsForParty(mockClient, 'alice::fingerprint');

    expect(result).toEqual([]);
  });

  it('returns empty array when no locked amulets exist', async () => {
    const mockClient = createMockValidatorClient({
      amulets: [],
      locked_amulets: [],
    });

    const result = await getLockedAmuletsForParty(mockClient, 'alice::fingerprint');

    expect(result).toEqual([]);
  });

  it('returns all matching amulets for owner', async () => {
    const mockClient = createMockValidatorClient({
      amulets: [],
      locked_amulets: [
        createLockedAmuletEntry('alice::fingerprint', '100.0', { contractId: 'contract-1' }),
        createLockedAmuletEntry('alice::fingerprint', '200.0', { contractId: 'contract-2' }),
        createLockedAmuletEntry('alice::fingerprint', '50.0', { contractId: 'contract-3' }),
      ],
    });

    const result = await getLockedAmuletsForParty(mockClient, 'alice::fingerprint');

    expect(result).toHaveLength(3);
    expect(result.map((a) => a.effectiveAmount).sort((a, b) => a - b)).toEqual([50, 100, 200]);
  });

  it('extracts all fields correctly', async () => {
    const mockClient = createMockValidatorClient({
      amulets: [],
      locked_amulets: [
        createLockedAmuletEntry('alice::fingerprint', '100.5', {
          contractId: 'contract-alice-1',
          templateId: 'pkg:Splice.Amulet:LockedAmulet',
          holders: ['holder1', 'holder2'],
          expiresAt: '2026-12-31T23:59:59Z',
          domainId: 'domain-xyz',
          createdEventBlob: 'blob-abc',
        }),
      ],
    });

    const result = await getLockedAmuletsForParty(mockClient, 'alice::fingerprint');

    expect(result).toHaveLength(1);
    const amulet = result[0]!;
    expect(amulet.contractId).toBe('contract-alice-1');
    expect(amulet.templateId).toBe('pkg:Splice.Amulet:LockedAmulet');
    expect(amulet.owner).toBe('alice::fingerprint');
    expect(amulet.effectiveAmount).toBe(100.5);
    expect(amulet.holders).toEqual(['holder1', 'holder2']);
    expect(amulet.lockExpiresAt).toBe('2026-12-31T23:59:59Z');
    expect(amulet.domainId).toBe('domain-xyz');
    expect(amulet.createdEventBlob).toBe('blob-abc');
  });

  it('handles holders in different formats', async () => {
    const mockClient = createMockValidatorClient({
      amulets: [],
      locked_amulets: [
        {
          effective_amount: '100.0',
          round: 10,
          accrued_holding_fee: '0.001',
          contract: {
            contract: {
              template_id: 'pkg:Splice.Amulet:LockedAmulet',
              contract_id: 'contract-1',
              created_event_blob: 'blob-123',
              created_at: '2026-01-01T00:00:00Z',
              payload: {
                amulet: { owner: 'alice::fingerprint' },
                lock: {
                  // Holders as objects with owner field
                  holders: [{ owner: 'holder1' }, { owner: 'holder2' }],
                  expiresAt: null,
                },
              },
            },
            domain_id: 'domain-123',
          },
        },
      ],
    });

    const result = await getLockedAmuletsForParty(mockClient, 'alice::fingerprint');

    expect(result).toHaveLength(1);
    expect(result[0]?.holders).toEqual(['holder1', 'holder2']);
  });

  it('handles null lockExpiresAt', async () => {
    const mockClient = createMockValidatorClient({
      amulets: [],
      locked_amulets: [
        createLockedAmuletEntry('alice::fingerprint', '100.0', {
          expiresAt: null,
        }),
      ],
    });

    const result = await getLockedAmuletsForParty(mockClient, 'alice::fingerprint');

    expect(result).toHaveLength(1);
    expect(result[0]?.lockExpiresAt).toBeNull();
  });

  it('throws on missing contract_id', async () => {
    const mockClient = createMockValidatorClient({
      amulets: [],
      locked_amulets: [
        {
          effective_amount: '100.0',
          round: 10,
          accrued_holding_fee: '0.001',
          contract: {
            contract: {
              template_id: 'pkg:Splice.Amulet:LockedAmulet',
              contract_id: '', // Empty
              created_event_blob: 'blob-123',
              created_at: '2026-01-01T00:00:00Z',
              payload: {
                amulet: { owner: 'alice::fingerprint' },
                lock: { holders: [], expiresAt: null },
              },
            },
            domain_id: 'domain-123',
          },
        },
      ],
    });

    await expect(getLockedAmuletsForParty(mockClient, 'alice::fingerprint')).rejects.toThrow(
      'locked amulet #1 contract_id must be a non-empty string'
    );
  });

  it('throws ValidationError on invalid effective_amount', async () => {
    const mockClient = createMockValidatorClient({
      amulets: [],
      locked_amulets: [createLockedAmuletEntry('alice::fingerprint', '-100')],
    });

    await expect(getLockedAmuletsForParty(mockClient, 'alice::fingerprint')).rejects.toThrow(ValidationError);
    await expect(getLockedAmuletsForParty(mockClient, 'alice::fingerprint')).rejects.toThrow(
      'locked amulet #1 effective_amount has an invalid effective amount'
    );
  });

  it('throws ValidationError on zero effective_amount', async () => {
    const mockClient = createMockValidatorClient({
      amulets: [],
      locked_amulets: [createLockedAmuletEntry('alice::fingerprint', '0')],
    });

    await expect(getLockedAmuletsForParty(mockClient, 'alice::fingerprint')).rejects.toThrow(ValidationError);
    await expect(getLockedAmuletsForParty(mockClient, 'alice::fingerprint')).rejects.toThrow(
      'locked amulet #1 effective_amount has an invalid effective amount'
    );
  });
});
