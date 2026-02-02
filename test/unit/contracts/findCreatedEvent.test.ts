import type { SubmitAndWaitForTransactionTreeResponse } from '../../../src/clients/ledger-json-api/operations';
import { findCreatedEventByTemplateId } from '../../../src/utils/contracts/findCreatedEvent';

interface MockCreatedTreeEvent {
  CreatedTreeEvent: {
    value: {
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
  };
}

interface MockExercisedTreeEvent {
  ExercisedTreeEvent: {
    value: {
      contractId: string;
      templateId: string;
      choice: string;
      choiceArgument: Record<string, never>;
    };
  };
}

const createMockResponse = (events: Record<string, unknown>): SubmitAndWaitForTransactionTreeResponse =>
  ({
    transactionTree: {
      updateId: 'update-123',
      commandId: 'cmd-123',
      effectiveAt: '2026-01-01T00:00:00Z',
      offset: 100,
      eventsById: events,
      rootEventIds: Object.keys(events),
      synchronizerId: 'sync-123',
      traceContext: undefined,
      recordTime: '2026-01-01T00:00:00Z',
    },
  }) as unknown as SubmitAndWaitForTransactionTreeResponse;

const createCreatedTreeEvent = (contractId: string, templateId: string): MockCreatedTreeEvent => ({
  CreatedTreeEvent: {
    value: {
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
  },
});

const createExercisedTreeEvent = (contractId: string): MockExercisedTreeEvent => ({
  ExercisedTreeEvent: {
    value: {
      contractId,
      templateId: 'pkg:Module:Template',
      choice: 'TestChoice',
      choiceArgument: {},
    },
  },
});

describe('findCreatedEventByTemplateId', () => {
  it('finds event by exact template ID suffix match', () => {
    const response = createMockResponse({
      '1': createCreatedTreeEvent('contract-1', 'abc123:Splice.Amulet:TransferPreapproval'),
      '2': createCreatedTreeEvent('contract-2', 'def456:Splice.Wallet:WalletInstall'),
    });

    const result = findCreatedEventByTemplateId(response, '#splice-amulet:Splice.Amulet:TransferPreapproval');

    expect(result).toBeDefined();
    expect(result?.CreatedTreeEvent.value.contractId).toBe('contract-1');
  });

  it('matches template ID ignoring package prefix', () => {
    const response = createMockResponse({
      '1': createCreatedTreeEvent('contract-1', 'different-package-id:Module:Template'),
    });

    const result = findCreatedEventByTemplateId(response, 'any-prefix:Module:Template');

    expect(result).toBeDefined();
    expect(result?.CreatedTreeEvent.value.contractId).toBe('contract-1');
  });

  it('returns undefined when no matching event found', () => {
    const response = createMockResponse({
      '1': createCreatedTreeEvent('contract-1', 'pkg:Module:OtherTemplate'),
    });

    const result = findCreatedEventByTemplateId(response, 'pkg:Module:NonExistent');

    expect(result).toBeUndefined();
  });

  it('ignores non-CreatedTreeEvent events', () => {
    const response = createMockResponse({
      '1': createExercisedTreeEvent('contract-1'),
      '2': createCreatedTreeEvent('contract-2', 'pkg:Module:Target'),
    });

    const result = findCreatedEventByTemplateId(response, 'pkg:Module:Target');

    expect(result).toBeDefined();
    expect(result?.CreatedTreeEvent.value.contractId).toBe('contract-2');
  });

  it('returns first matching event when multiple matches exist', () => {
    const response = createMockResponse({
      '1': createCreatedTreeEvent('contract-1', 'pkg1:Module:Template'),
      '2': createCreatedTreeEvent('contract-2', 'pkg2:Module:Template'),
    });

    const result = findCreatedEventByTemplateId(response, 'any:Module:Template');

    expect(result).toBeDefined();
    // Returns first match found during iteration
    expect(['contract-1', 'contract-2']).toContain(result?.CreatedTreeEvent.value.contractId);
  });

  it('handles empty events object', () => {
    const response = createMockResponse({});

    const result = findCreatedEventByTemplateId(response, 'pkg:Module:Template');

    expect(result).toBeUndefined();
  });

  it('handles template ID without package prefix', () => {
    const response = createMockResponse({
      '1': createCreatedTreeEvent('contract-1', 'Module:Template'),
    });

    const result = findCreatedEventByTemplateId(response, 'Module:Template');

    expect(result).toBeDefined();
    expect(result?.CreatedTreeEvent.value.contractId).toBe('contract-1');
  });
});
