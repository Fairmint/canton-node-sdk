import { ValidationError } from '../../../src/core/errors';
import {
  getJsActiveContractItems,
  getJsActiveCreatedEvents,
  isJsActiveContractItem,
  type JsActiveContractItem,
} from '../../../src/utils/contracts/jsActiveContract';

const createJsActiveContractItem = (
  contractId: string,
  templateId: string,
  owner = 'alice::fp'
): JsActiveContractItem => ({
  workflowId: `workflow-${contractId}`,
  contractEntry: {
    JsActiveContract: {
      synchronizerId: 'sync-1',
      reassignmentCounter: 0,
      createdEvent: {
        offset: 1,
        nodeId: 1,
        contractId,
        templateId,
        contractKey: null,
        createArgument: {
          owner,
        },
        createdEventBlob: `blob-${contractId}`,
        interfaceViews: [],
        witnessParties: [owner],
        signatories: [owner],
        observers: [],
        createdAt: '2026-01-01T00:00:00Z',
        packageName: 'test-package',
      },
    },
  },
});

describe('jsActiveContract helpers', () => {
  it('identifies canonical JsActiveContract items', () => {
    expect(isJsActiveContractItem(createJsActiveContractItem('contract-1', 'pkg:Module:Template'))).toBe(true);
  });

  it('rejects non-canonical entries', () => {
    expect(
      isJsActiveContractItem({
        contractEntry: {
          JsActiveContract: {
            createdEvent: {
              contractId: 'contract-1',
              templateId: 'pkg:Module:Template',
              createArgument: {},
            },
          },
        },
      })
    ).toBe(false);

    expect(isJsActiveContractItem({ contractEntry: { JsEmpty: {} } })).toBe(false);
  });

  it('returns validated JsActiveContract items', () => {
    const items = [
      createJsActiveContractItem('contract-1', 'pkg:Module:Template'),
      createJsActiveContractItem('contract-2', 'pkg:Module:OtherTemplate'),
    ];

    const result = getJsActiveContractItems(items);

    expect(result).toHaveLength(2);
    expect(result[0]?.contractEntry.JsActiveContract.createdEvent.contractId).toBe('contract-1');
    expect(result[1]?.contractEntry.JsActiveContract.createdEvent.contractId).toBe('contract-2');
  });

  it('returns created events from validated JsActiveContract items', () => {
    const result = getJsActiveCreatedEvents([
      createJsActiveContractItem('contract-1', 'pkg:Module:Template'),
      createJsActiveContractItem('contract-2', 'pkg:Module:OtherTemplate'),
    ]);

    expect(result.map((event) => event.contractId)).toEqual(['contract-1', 'contract-2']);
  });

  it('throws when getActiveContracts returns a non-canonical entry', () => {
    expect(() =>
      getJsActiveCreatedEvents([
        createJsActiveContractItem('contract-1', 'pkg:Module:Template'),
        { contractEntry: { JsEmpty: {} } },
      ])
    ).toThrow(ValidationError);

    expect(() =>
      getJsActiveContractItems([
        createJsActiveContractItem('contract-1', 'pkg:Module:Template'),
        { contractEntry: { JsEmpty: {} } },
      ])
    ).toThrow('Expected getActiveContracts to return only canonical JsActiveContract entries');
  });
});
