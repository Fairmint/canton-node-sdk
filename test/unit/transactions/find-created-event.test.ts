import type { SubmitAndWaitForTransactionResponse } from '../../../src/clients/ledger-json-api/operations/v2/commands/submit-and-wait-for-transaction';
import { findCreatedEventByTemplateName } from '../../../src/utils/transactions/find-created-event';

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

describe('findCreatedEventByTemplateName', () => {
  it('finds event by template name (last part after colon)', () => {
    const response = createMockResponse([
      createCreatedEvent('contract-1', 'abc123:Splice.Amulet:FeaturedAppActivityMarker'),
      createCreatedEvent('contract-2', 'def456:Splice.Wallet:WalletInstall'),
    ]);

    const result = findCreatedEventByTemplateName(response, 'FeaturedAppActivityMarker');

    expect(result).toBeDefined();
    expect(result?.contractId).toBe('contract-1');
  });

  it('matches template name without package/module prefix', () => {
    const response = createMockResponse([
      createCreatedEvent('contract-1', 'package-id:Module.SubModule:TargetTemplate'),
    ]);

    const result = findCreatedEventByTemplateName(response, 'TargetTemplate');

    expect(result).toBeDefined();
    expect(result?.contractId).toBe('contract-1');
  });

  it('returns undefined when no matching event found', () => {
    const response = createMockResponse([createCreatedEvent('contract-1', 'pkg:Module:OtherTemplate')]);

    const result = findCreatedEventByTemplateName(response, 'NonExistent');

    expect(result).toBeUndefined();
  });

  it('ignores non-CreatedEvent events', () => {
    const response = createMockResponse([
      createExercisedEvent('contract-1'),
      createCreatedEvent('contract-2', 'pkg:Module:Target'),
    ]);

    const result = findCreatedEventByTemplateName(response, 'Target');

    expect(result).toBeDefined();
    expect(result?.contractId).toBe('contract-2');
  });

  it('handles empty events array', () => {
    const response = createMockResponse([]);

    const result = findCreatedEventByTemplateName(response, 'Template');

    expect(result).toBeUndefined();
  });

  it('handles template ID with multiple colons', () => {
    const response = createMockResponse([createCreatedEvent('contract-1', 'pkg:Splice.Amulet:Nested:DeepTemplate')]);

    // Should match only the last part after final colon
    const result = findCreatedEventByTemplateName(response, 'DeepTemplate');

    expect(result).toBeDefined();
    expect(result?.contractId).toBe('contract-1');
  });

  it('does not match partial template names', () => {
    const response = createMockResponse([createCreatedEvent('contract-1', 'pkg:Module:TransferPreapproval')]);

    // Should not match partial name
    const result = findCreatedEventByTemplateName(response, 'Transfer');

    expect(result).toBeUndefined();
  });

  it('is case-sensitive', () => {
    const response = createMockResponse([createCreatedEvent('contract-1', 'pkg:Module:Template')]);

    const result = findCreatedEventByTemplateName(response, 'template');

    expect(result).toBeUndefined();
  });
});
