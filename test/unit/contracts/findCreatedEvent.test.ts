import type { SubmitAndWaitForTransactionResponse } from '../../../src/clients/ledger-json-api/operations';
import { findCreatedEventByTemplateId } from '../../../src/utils/contracts/findCreatedEvent';

interface MockCreatedEvent {
  CreatedEvent: {
    contractId: string;
    templateId: string;
    contractKey: undefined;
    createArgument: Record<string, string>;
    createdEventBlob: string;
    witnessParties: string[];
    signatories: string[];
    observers: string[];
    createdAt: string;
    packageName: string;
  };
}

interface MockExercisedEvent {
  ExercisedEvent: {
    contractId: string;
    templateId: string;
    choice: string;
    choiceArgument: Record<string, never>;
  };
}

const createMockResponse = (events: readonly unknown[]): SubmitAndWaitForTransactionResponse =>
  ({
    transaction: {
      updateId: 'update-123',
      commandId: 'cmd-123',
      workflowId: '',
      effectiveAt: '2026-01-01T00:00:00Z',
      offset: 100,
      events,
      synchronizerId: 'sync-123',
      traceContext: undefined,
      recordTime: '2026-01-01T00:00:00Z',
    },
  }) as unknown as SubmitAndWaitForTransactionResponse;

const createCreatedEvent = (contractId: string, templateId: string): MockCreatedEvent => ({
  CreatedEvent: {
    contractId,
    templateId,
    contractKey: undefined,
    createArgument: { foo: 'bar' },
    createdEventBlob: 'blob-123',
    witnessParties: ['party1'],
    signatories: ['party1'],
    observers: [],
    createdAt: '2026-01-01T00:00:00Z',
    packageName: 'test-package',
  },
});

const createExercisedEvent = (contractId: string): MockExercisedEvent => ({
  ExercisedEvent: {
    contractId,
    templateId: 'pkg:Module:Template',
    choice: 'TestChoice',
    choiceArgument: {},
  },
});

describe('findCreatedEventByTemplateId', () => {
  it('finds event by exact template ID suffix match', () => {
    const response = createMockResponse([
      createCreatedEvent('contract-1', 'abc123:Splice.Amulet:TransferPreapproval'),
      createCreatedEvent('contract-2', 'def456:Splice.Wallet:WalletInstall'),
    ]);

    const result = findCreatedEventByTemplateId(response, '#splice-amulet:Splice.Amulet:TransferPreapproval');

    expect(result).toBeDefined();
    expect(result?.contractId).toBe('contract-1');
  });

  it('matches template ID ignoring package prefix', () => {
    const response = createMockResponse([createCreatedEvent('contract-1', 'different-package-id:Module:Template')]);

    const result = findCreatedEventByTemplateId(response, 'any-prefix:Module:Template');

    expect(result).toBeDefined();
    expect(result?.contractId).toBe('contract-1');
  });

  it('returns undefined when no matching event found', () => {
    const response = createMockResponse([createCreatedEvent('contract-1', 'pkg:Module:OtherTemplate')]);

    const result = findCreatedEventByTemplateId(response, 'pkg:Module:NonExistent');

    expect(result).toBeUndefined();
  });

  it('ignores non-CreatedEvent events', () => {
    const response = createMockResponse([
      createExercisedEvent('contract-1'),
      createCreatedEvent('contract-2', 'pkg:Module:Target'),
    ]);

    const result = findCreatedEventByTemplateId(response, 'pkg:Module:Target');

    expect(result).toBeDefined();
    expect(result?.contractId).toBe('contract-2');
  });

  it('returns first matching event when multiple matches exist', () => {
    const response = createMockResponse([
      createCreatedEvent('contract-1', 'pkg1:Module:Template'),
      createCreatedEvent('contract-2', 'pkg2:Module:Template'),
    ]);

    const result = findCreatedEventByTemplateId(response, 'any:Module:Template');

    expect(result).toBeDefined();
    expect(result?.contractId).toBe('contract-1');
  });

  it('handles empty events array', () => {
    const response = createMockResponse([]);

    const result = findCreatedEventByTemplateId(response, 'pkg:Module:Template');

    expect(result).toBeUndefined();
  });

  it('handles template ID without package prefix', () => {
    const response = createMockResponse([createCreatedEvent('contract-1', 'Module:Template')]);

    const result = findCreatedEventByTemplateId(response, 'Module:Template');

    expect(result).toBeDefined();
    expect(result?.contractId).toBe('contract-1');
  });
});
