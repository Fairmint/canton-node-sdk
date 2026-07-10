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
    committed: true,
  },
  requestedAt: '2026-07-10T01:00:00.000Z',
  inputHoldingCids: ['#cash-holding'],
  actors: ['Buyer::alice'],
};

const allocationResultCommon = {
  authorizerChangeCids: { change: ['#change-holding'] },
  meta: { values: { source: 'registry' } },
} as const;

function createRegistryClient(response: unknown): TokenStandardV2AllocationRegistryClient & {
  readonly getAllocationFactoryV2FromRegistry: jest.Mock;
} {
  return {
    getAllocationFactoryV2FromRegistry: jest.fn(async () => response),
  };
}

describe('Token Standard V2 allocation helpers', () => {
  test('builds the exact V2 AllocationFactory_Allocate command with explicit commitment', () => {
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

  test('requires callers to choose whether the allocation is committed', () => {
    const missingCommitment = {
      ...allocationParams,
      allocation: {
        ...allocationParams.allocation,
        committed: undefined,
      },
    } as unknown as BuildTokenStandardV2AllocationChoiceArgumentParams;

    expect(() => buildTokenStandardV2AllocationChoiceArgument(missingCommitment)).toThrow(
      TokenStandardV2AllocationError
    );
  });

  test('rejects malformed runtime objects and null optional metadata with typed errors', () => {
    const transferLegSide = allocationParams.allocation.transferLegSides[0];
    if (!transferLegSide) throw new Error('test fixture must include one transfer-leg side');
    const malformedParams: readonly unknown[] = [
      null,
      undefined,
      { ...allocationParams, settlement: null },
      { ...allocationParams, allocation: null },
      { ...allocationParams, extraArgs: null },
      { ...allocationParams, settlement: { ...allocationParams.settlement, meta: null } },
      { ...allocationParams, allocation: { ...allocationParams.allocation, meta: null } },
      {
        ...allocationParams,
        allocation: {
          ...allocationParams.allocation,
          transferLegSides: [{ ...transferLegSide, meta: null }],
        },
      },
    ];

    for (const value of malformedParams) {
      let error: unknown;
      try {
        buildTokenStandardV2AllocationChoiceArgument(value as BuildTokenStandardV2AllocationChoiceArgumentParams);
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({
        name: 'TokenStandardV2AllocationError',
        code: 'TOKEN_STANDARD_V2_ALLOCATION_INPUT_INVALID',
      });
    }
  });

  test('preserves settlement text identifiers and normalizes parties and contract ids', () => {
    expect(
      buildTokenStandardV2AllocationChoiceArgument({
        ...allocationParams,
        settlement: {
          ...allocationParams.settlement,
          executors: [' Venue::operator '],
          id: ' settlement-3 ',
          cid: ' #settlement-context ',
        },
      }).settlement
    ).toMatchObject({
      executors: ['Venue::operator'],
      id: ' settlement-3 ',
      cid: '#settlement-context',
    });
    expect(
      buildTokenStandardV2AllocationChoiceArgument({
        ...allocationParams,
        settlement: { ...allocationParams.settlement, id: '', cid: '#settlement-context' },
      }).settlement.id
    ).toBe('');

    expect(() =>
      buildTokenStandardV2AllocationChoiceArgument({
        ...allocationParams,
        settlement: { ...allocationParams.settlement, executors: [] },
      })
    ).toThrow(TokenStandardV2AllocationError);
    expect(() =>
      buildTokenStandardV2AllocationChoiceArgument({
        ...allocationParams,
        settlement: { ...allocationParams.settlement, executors: [' '] },
      })
    ).toThrow(TokenStandardV2AllocationError);
  });

  test('enforces the upstream V2 allocation invariants without narrowing valid decimal text', () => {
    const transferLegSide = allocationParams.allocation.transferLegSides[0];
    if (!transferLegSide) throw new Error('test fixture must include one transfer-leg side');
    const buildWithAllocation = (
      allocation: BuildTokenStandardV2AllocationChoiceArgumentParams['allocation']
    ): ReturnType<typeof buildTokenStandardV2AllocationChoiceArgument> =>
      buildTokenStandardV2AllocationChoiceArgument({ ...allocationParams, allocation });

    expect(() =>
      buildWithAllocation({
        ...allocationParams.allocation,
        transferLegSides: [],
        nextIterationFunding: null,
      })
    ).toThrow(TokenStandardV2AllocationError);
    expect(
      buildWithAllocation({
        ...allocationParams.allocation,
        transferLegSides: [],
        nextIterationFunding: {},
      }).allocation.transferLegSides
    ).toEqual([]);
    expect(() =>
      buildWithAllocation({
        ...allocationParams.allocation,
        transferLegSides: [transferLegSide, { ...transferLegSide }],
      })
    ).toThrow(TokenStandardV2AllocationError);

    for (const amount of ['0', '-1.0']) {
      expect(() =>
        buildWithAllocation({
          ...allocationParams.allocation,
          transferLegSides: [{ ...transferLegSide, amount }],
        })
      ).toThrow(TokenStandardV2AllocationError);
    }
    for (const amount of ['1.0', '9999999999999999999999999999.1234567890']) {
      expect(
        buildWithAllocation({
          ...allocationParams.allocation,
          transferLegSides: [{ ...transferLegSide, amount }],
        }).allocation.transferLegSides[0]?.amount
      ).toBe(amount);
    }
    for (const amount of ['+1.0', '1.', '10000000000000000000000000000', '1.12345678901']) {
      expect(() =>
        buildWithAllocation({
          ...allocationParams.allocation,
          transferLegSides: [{ ...transferLegSide, amount }],
        })
      ).toThrow(TokenStandardV2AllocationError);
    }

    for (const amount of ['-1.0', '0']) {
      expect(() =>
        buildWithAllocation({
          ...allocationParams.allocation,
          nextIterationFunding: { USD: amount },
        })
      ).toThrow(TokenStandardV2AllocationError);
    }
    expect(
      buildWithAllocation({
        ...allocationParams.allocation,
        nextIterationFunding: { USD: '0.1' },
      }).allocation.nextIterationFunding
    ).toEqual({ USD: '0.1' });
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
      metadata: { values: { source: 'test' } },
      registryUrl: 'https://cash.example/token-registry',
      scan,
    });

    expect(scan.getAllocationFactoryV2FromRegistry).toHaveBeenCalledWith({
      registryUrl: 'https://cash.example/token-registry',
      choiceArguments: {
        ...buildTokenStandardV2AllocationChoiceArgument({
          ...allocationParams,
          extraArgs: {
            context: { values: {} },
            meta: { values: {} },
          },
        }),
      },
      excludeDebugFields: true,
    });
    expect(prepared.choiceArgument.extraArgs.context).toEqual(choiceContextData);
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

  test('rejects null prepare metadata instead of treating it as absent', async () => {
    const scan = createRegistryClient({
      factoryId: '#allocation-factory',
      choiceContext: {
        choiceContextData: { values: {} },
        disclosedContracts: [],
      },
    });

    await expect(
      prepareTokenStandardV2AllocationCommand({
        ...allocationParams,
        registryUrl: 'https://cash.example/token-registry',
        scan,
        metadata: null as never,
      })
    ).rejects.toMatchObject({
      name: 'TokenStandardV2AllocationError',
      code: 'TOKEN_STANDARD_V2_ALLOCATION_INPUT_INVALID',
    });
  });

  test('rejects malformed scan clients with typed input errors before registry access', async () => {
    const malformedScans: readonly unknown[] = [
      null,
      undefined,
      {},
      { getAllocationFactoryV2FromRegistry: null },
      { getAllocationFactoryV2FromRegistry: 'not-a-function' },
    ];

    for (const scan of malformedScans) {
      await expect(
        prepareTokenStandardV2AllocationCommand({
          ...allocationParams,
          registryUrl: 'https://cash.example/token-registry',
          scan: scan as TokenStandardV2AllocationRegistryClient,
        })
      ).rejects.toMatchObject({
        name: 'TokenStandardV2AllocationError',
        code: 'TOKEN_STANDARD_V2_ALLOCATION_INPUT_INVALID',
      });
    }
  });

  test.each([
    [
      'AllocationInstructionResult_Completed',
      { allocationCid: '#allocation' },
      { type: 'Completed', allocationCid: '#allocation', ...allocationResultCommon },
    ],
    [
      'AllocationInstructionResult_Pending',
      { allocationInstructionCid: '#instruction' },
      { type: 'Pending', allocationInstructionCid: '#instruction', ...allocationResultCommon },
    ],
    ['AllocationInstructionResult_Failed', {}, { type: 'Failed', ...allocationResultCommon }],
  ] as const)('parses the %s result variant', (tag, value, expected) => {
    expect(
      parseTokenStandardV2AllocationInstructionResult({
        output: { tag, value },
        ...allocationResultCommon,
      })
    ).toEqual(expected);
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
      parseTokenStandardV2AllocationInstructionResult({
        output: { tag: 'Unknown', value: {} },
        ...allocationResultCommon,
      });
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
                contractId: '#other-allocation-factory',
                templateId: TOKEN_STANDARD_V2_ALLOCATION_FACTORY_INTERFACE_ID,
                choice: TOKEN_STANDARD_V2_ALLOCATION_FACTORY_ALLOCATE_CHOICE,
                exerciseResult: {
                  output: {
                    tag: 'AllocationInstructionResult_Completed',
                    value: { allocationCid: '#wrong-allocation' },
                  },
                  ...allocationResultCommon,
                },
              },
            },
          },
          1: {
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
                  ...allocationResultCommon,
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
        deduplicationPeriod: { DeduplicationDuration: { seconds: 300 } },
        synchronizerId: 'sync::id',
        userId: 'worker-user',
        workflowId: 'scenario-3',
      })
    ).resolves.toEqual({
      updateId: 'update-3',
      result: { type: 'Completed', allocationCid: '#allocation', ...allocationResultCommon },
      response,
    });
    expect(submitAndWaitForTransactionTree).toHaveBeenCalledWith({
      commands: [prepared.command],
      actAs: ['Buyer::alice'],
      readAs: ['Observer::ops'],
      disclosedContracts: [...prepared.disclosedContracts],
      commandId: 'allocation-command',
      submissionId: 'allocation-submission',
      deduplicationPeriod: { DeduplicationDuration: { seconds: 300 } },
      synchronizerId: 'sync::id',
      userId: 'worker-user',
      workflowId: 'scenario-3',
    });

    await expect(
      submitPreparedTokenStandardV2Allocation({
        ledger: { submitAndWaitForTransactionTree },
        prepared,
        actAs: ['Buyer::alice'],
        commandId: ' ',
      })
    ).rejects.toThrow(TokenStandardV2AllocationError);
    expect(submitAndWaitForTransactionTree).toHaveBeenCalledTimes(1);
  });

  test('rejects malformed submit inputs with typed errors before ledger submission', async () => {
    const prepared = await prepareTokenStandardV2AllocationCommand({
      ...allocationParams,
      registryUrl: 'https://cash.example',
      scan: createRegistryClient({
        factoryId: '#allocation-factory',
        choiceContext: {
          choiceContextData: { values: {} },
          disclosedContracts: [],
        },
      }),
    });
    const submitAndWaitForTransactionTree = jest.fn();
    const validParams = {
      ledger: { submitAndWaitForTransactionTree },
      prepared,
      actAs: ['Buyer::alice'],
      commandId: 'allocation-command',
    };
    const malformedParams: readonly unknown[] = [
      null,
      undefined,
      { ...validParams, prepared: null },
      { ...validParams, prepared: undefined },
      { ...validParams, prepared: {} },
      { ...validParams, prepared: { ...prepared, command: null } },
      { ...validParams, prepared: { ...prepared, disclosedContracts: null } },
      { ...validParams, prepared: { ...prepared, allocationFactoryContractId: null } },
      { ...validParams, ledger: null },
      { ...validParams, ledger: undefined },
      { ...validParams, ledger: {} },
      { ...validParams, ledger: { submitAndWaitForTransactionTree: null } },
    ];

    for (const params of malformedParams) {
      await expect(
        submitPreparedTokenStandardV2Allocation(params as Parameters<typeof submitPreparedTokenStandardV2Allocation>[0])
      ).rejects.toMatchObject({
        name: 'TokenStandardV2AllocationError',
        code: 'TOKEN_STANDARD_V2_ALLOCATION_INPUT_INVALID',
      });
    }
    expect(submitAndWaitForTransactionTree).not.toHaveBeenCalled();
  });
});
