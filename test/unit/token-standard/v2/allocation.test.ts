import type { SubmitAndWaitForTransactionTreeResponse } from '../../../../src/clients/ledger-json-api/operations/v2/commands/submit-and-wait-for-transaction-tree';
import {
  buildTokenStandardV2AllocationChoiceArgument,
  buildTokenStandardV2AllocationCommand,
  parseTokenStandardV2AllocationInstructionResult,
  prepareTokenStandardV2AllocationCommand,
  submitPreparedTokenStandardV2Allocation,
  TOKEN_STANDARD_V2_ALLOCATION_FACTORY_ALLOCATE_CHOICE,
  TOKEN_STANDARD_V2_ALLOCATION_FACTORY_INTERFACE_ID,
  TokenStandardV2AllocationError,
  type BuildTokenStandardV2AllocationChoiceArgumentParams,
  type TokenStandardV2AllocationRegistryClient,
} from '../../../../src/utils/token-standard';

const allocationParams: BuildTokenStandardV2AllocationChoiceArgumentParams = {
  settlement: {
    executors: ['Venue::operator'],
    id: 'settlement-3',
    cid: null,
  },
  allocation: {
    admin: 'CashAdmin::issuer',
    authorizer: {
      owner: 'Buyer::alice',
      provider: null,
      id: '',
    },
    transferLegSides: [
      {
        transferLegId: 'cash-leg',
        side: 'SenderSide',
        otherside: {
          owner: 'Seller::bob',
          provider: null,
          id: '',
        },
        amount: '25.0',
        instrumentId: 'USD',
      },
    ],
    settlementDeadline: '2026-07-10T02:00:00.000Z',
  },
  requestedAt: '2026-07-10T01:00:00.000Z',
  inputHoldingCids: ['#cash-holding'],
  actors: ['Buyer::alice'],
};

function createRegistryClient(response: unknown): TokenStandardV2AllocationRegistryClient & {
  readonly getAllocationFactoryFromRegistry: jest.Mock;
} {
  return {
    getAllocationFactoryFromRegistry: jest.fn(async () => response),
  };
}

describe('Token Standard V2 allocation helpers', () => {
  test('builds the exact V2 AllocationFactory_Allocate command and defaults committed to true', () => {
    expect(
      buildTokenStandardV2AllocationCommand({
        ...allocationParams,
        allocationFactoryContractId: '#allocation-factory',
      })
    ).toEqual({
      ExerciseCommand: {
        templateId: TOKEN_STANDARD_V2_ALLOCATION_FACTORY_INTERFACE_ID,
        contractId: '#allocation-factory',
        choice: TOKEN_STANDARD_V2_ALLOCATION_FACTORY_ALLOCATE_CHOICE,
        choiceArgument: {
          settlement: {
            ...allocationParams.settlement,
            meta: { values: {} },
          },
          allocation: {
            ...allocationParams.allocation,
            transferLegSides: [
              {
                ...allocationParams.allocation.transferLegSides[0],
                meta: { values: {} },
              },
            ],
            nextIterationFunding: null,
            committed: true,
            meta: { values: {} },
          },
          requestedAt: allocationParams.requestedAt,
          inputHoldingCids: allocationParams.inputHoldingCids,
          extraArgs: {
            context: { values: {} },
            meta: { values: {} },
          },
          actors: allocationParams.actors,
        },
      },
    });
  });

  test('preserves explicit committed false and permits a V2 interface ID override', () => {
    const choiceArgument = buildTokenStandardV2AllocationChoiceArgument({
      ...allocationParams,
      allocation: {
        ...allocationParams.allocation,
        committed: false,
      },
    });
    expect(choiceArgument.allocation.committed).toBe(false);

    expect(
      buildTokenStandardV2AllocationCommand({
        ...allocationParams,
        allocationFactoryContractId: '#allocation-factory',
        allocationFactoryInterfaceId: '#custom-v2:Token:AllocationFactory',
      })
    ).toMatchObject({
      ExerciseCommand: {
        templateId: '#custom-v2:Token:AllocationFactory',
      },
    });
  });

  test('prepares through an arbitrary registry and preserves its context and disclosures', async () => {
    const choiceContextData = {
      values: {
        'cash.example/rules': {
          tag: 'AV_ContractId',
          value: '#cash-rules',
        },
      },
    };
    const scan = createRegistryClient({
      factoryId: '#allocation-factory',
      choiceContext: {
        choiceContextData,
        disclosedContracts: [
          {
            templateId: '#cash:Cash:Rules',
            contractId: '#cash-rules',
            createdEventBlob: 'blob',
            synchronizerId: 'sync::id',
            debugPackageName: 'cash',
            debugPayload: { admin: 'CashAdmin::issuer' },
          },
        ],
      },
    });
    const prepared = await prepareTokenStandardV2AllocationCommand({
      ...allocationParams,
      extraArgs: {
        context: { values: { ignored: true } },
        meta: { values: { source: 'test' } },
      },
      registryUrl: 'https://cash.example/token-registry',
      scan,
      excludeDebugFields: true,
    });

    expect(scan.getAllocationFactoryFromRegistry).toHaveBeenCalledWith({
      registryUrl: 'https://cash.example/token-registry',
      choiceArguments: {
        ...buildTokenStandardV2AllocationChoiceArgument({
          ...allocationParams,
          extraArgs: {
            context: { values: { ignored: true } },
            meta: { values: { source: 'test' } },
          },
        }),
      },
      excludeDebugFields: true,
    });
    expect(prepared.choiceArgument.extraArgs.context).toBe(choiceContextData);
    expect(prepared.choiceArgument.extraArgs.meta).toEqual({ values: { source: 'test' } });
    expect(prepared.disclosedContracts).toEqual([
      {
        templateId: '#cash:Cash:Rules',
        contractId: '#cash-rules',
        createdEventBlob: 'blob',
        synchronizerId: 'sync::id',
      },
    ]);
    expect(prepared.command).toMatchObject({
      ExerciseCommand: {
        contractId: '#allocation-factory',
        choiceArgument: {
          extraArgs: {
            context: choiceContextData,
            meta: { values: { source: 'test' } },
          },
        },
      },
    });
  });

  test.each([
    [
      'AllocationInstructionResult_Completed',
      { allocationCid: '#allocation' },
      { type: 'Completed', allocationCid: '#allocation' },
    ],
    [
      'AllocationInstructionResult_Pending',
      { allocationInstructionCid: '#instruction' },
      { type: 'Pending', allocationInstructionCid: '#instruction' },
    ],
    ['AllocationInstructionResult_Failed', {}, { type: 'Failed' }],
  ] as const)('parses the %s result variant', (tag, value, expected) => {
    expect(parseTokenStandardV2AllocationInstructionResult({ output: { tag, value } })).toEqual(expected);
  });

  test('rejects malformed registry and result responses with typed errors', async () => {
    const malformedRegistryResponses = [
      { factoryId: '' },
      {
        factoryId: '#allocation-factory',
        choiceContext: { choiceContextData: null, disclosedContracts: [] },
      },
      {
        factoryId: '#allocation-factory',
        choiceContext: {
          choiceContextData: { values: {} },
          disclosedContracts: [
            {
              templateId: '#cash:Cash:Rules',
              contractId: '#cash-rules',
              synchronizerId: 'sync::id',
            },
          ],
        },
      },
    ];
    for (const response of malformedRegistryResponses) {
      await expect(
        prepareTokenStandardV2AllocationCommand({
          ...allocationParams,
          registryUrl: 'https://cash.example',
          scan: createRegistryClient(response),
        })
      ).rejects.toMatchObject({
        name: 'TokenStandardV2AllocationError',
        code: 'TOKEN_STANDARD_V2_ALLOCATION_FACTORY_RESPONSE_INVALID',
      });
    }

    expect(() =>
      parseTokenStandardV2AllocationInstructionResult({
        output: {
          tag: 'AllocationInstructionResult_Completed',
          value: {},
        },
      })
    ).toThrow(TokenStandardV2AllocationError);
    let unknownTagError: unknown;
    try {
      parseTokenStandardV2AllocationInstructionResult({ output: { tag: 'Unknown', value: {} } });
    } catch (error) {
      unknownTagError = error;
    }
    expect(unknownTagError).toMatchObject({
      code: 'TOKEN_STANDARD_V2_ALLOCATION_RESULT_INVALID',
    });
  });

  test('forwards prepared commands and disclosures to ledger submission and parses the transaction result', async () => {
    const scan = createRegistryClient({
      factoryId: '#allocation-factory',
      choiceContext: {
        choiceContextData: { values: {} },
        disclosedContracts: [
          {
            templateId: '#cash:Cash:Rules',
            contractId: '#cash-rules',
            createdEventBlob: 'blob',
            synchronizerId: 'sync::id',
          },
        ],
      },
    });
    const prepared = await prepareTokenStandardV2AllocationCommand({
      ...allocationParams,
      registryUrl: 'https://cash.example',
      scan,
    });
    const response = {
      transactionTree: {
        updateId: 'update-3',
        eventsById: {
          0: {
            ExercisedTreeEvent: {
              value: {
                contractId: '#allocation-factory',
                templateId: TOKEN_STANDARD_V2_ALLOCATION_FACTORY_INTERFACE_ID,
                choice: TOKEN_STANDARD_V2_ALLOCATION_FACTORY_ALLOCATE_CHOICE,
                exerciseResult: {
                  output: {
                    tag: 'AllocationInstructionResult_Completed',
                    value: { allocationCid: '#allocation' },
                  },
                },
              },
            },
          },
        },
      },
    } as unknown as SubmitAndWaitForTransactionTreeResponse;
    const submitAndWaitForTransactionTree = jest.fn(async () => response);

    await expect(
      submitPreparedTokenStandardV2Allocation({
        ledger: { submitAndWaitForTransactionTree },
        prepared,
        actAs: [' Buyer::alice '],
        readAs: ['Observer::ops'],
        commandId: 'allocation-command',
        submissionId: 'allocation-submission',
      })
    ).resolves.toEqual({
      updateId: 'update-3',
      result: { type: 'Completed', allocationCid: '#allocation' },
      response,
    });
    expect(submitAndWaitForTransactionTree).toHaveBeenCalledWith({
      commands: [prepared.command],
      actAs: ['Buyer::alice'],
      readAs: ['Observer::ops'],
      disclosedContracts: [...prepared.disclosedContracts],
      commandId: 'allocation-command',
      submissionId: 'allocation-submission',
    });
  });
});
