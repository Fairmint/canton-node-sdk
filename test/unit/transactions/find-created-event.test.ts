import { findCreatedEventByTemplateName } from '../../../src/utils/transactions/find-created-event';
import type { SubmitAndWaitForTransactionTreeResponse } from '../../../src/clients/ledger-json-api/operations/v2/commands/submit-and-wait-for-transaction-tree';

const createMockResponse = (
  events: Record<string, unknown>
): SubmitAndWaitForTransactionTreeResponse =>
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

const createCreatedTreeEvent = (contractId: string, templateId: string) => ({
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

const createExercisedTreeEvent = (contractId: string) => ({
  ExercisedTreeEvent: {
    value: {
      contractId,
      templateId: 'pkg:Module:Template',
      choice: 'TestChoice',
      choiceArgument: {},
    },
  },
});

describe('findCreatedEventByTemplateName', () => {
  it('finds event by template name (last part after colon)', () => {
    const response = createMockResponse({
      '1': createCreatedTreeEvent('contract-1', 'abc123:Splice.Amulet:FeaturedAppActivityMarker'),
      '2': createCreatedTreeEvent('contract-2', 'def456:Splice.Wallet:WalletInstall'),
    });

    const result = findCreatedEventByTemplateName(response, 'FeaturedAppActivityMarker');

    expect(result).toBeDefined();
  });

  it('matches template name without package/module prefix', () => {
    const response = createMockResponse({
      '1': createCreatedTreeEvent('contract-1', 'package-id:Module.SubModule:TargetTemplate'),
    });

    const result = findCreatedEventByTemplateName(response, 'TargetTemplate');

    expect(result).toBeDefined();
  });

  it('returns undefined when no matching event found', () => {
    const response = createMockResponse({
      '1': createCreatedTreeEvent('contract-1', 'pkg:Module:OtherTemplate'),
    });

    const result = findCreatedEventByTemplateName(response, 'NonExistent');

    expect(result).toBeUndefined();
  });

  it('ignores non-CreatedTreeEvent events', () => {
    const response = createMockResponse({
      '1': createExercisedTreeEvent('contract-1'),
      '2': createCreatedTreeEvent('contract-2', 'pkg:Module:Target'),
    });

    const result = findCreatedEventByTemplateName(response, 'Target');

    expect(result).toBeDefined();
  });

  it('handles empty events object', () => {
    const response = createMockResponse({});

    const result = findCreatedEventByTemplateName(response, 'Template');

    expect(result).toBeUndefined();
  });

  it('handles template ID with multiple colons', () => {
    const response = createMockResponse({
      '1': createCreatedTreeEvent('contract-1', 'pkg:Splice.Amulet:Nested:DeepTemplate'),
    });

    // Should match only the last part after final colon
    const result = findCreatedEventByTemplateName(response, 'DeepTemplate');

    expect(result).toBeDefined();
  });

  it('does not match partial template names', () => {
    const response = createMockResponse({
      '1': createCreatedTreeEvent('contract-1', 'pkg:Module:TransferPreapproval'),
    });

    // Should not match partial name
    const result = findCreatedEventByTemplateName(response, 'Transfer');

    expect(result).toBeUndefined();
  });

  it('is case-sensitive', () => {
    const response = createMockResponse({
      '1': createCreatedTreeEvent('contract-1', 'pkg:Module:Template'),
    });

    const result = findCreatedEventByTemplateName(response, 'template');

    expect(result).toBeUndefined();
  });
});
