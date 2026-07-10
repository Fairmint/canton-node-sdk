import {
  buildTokenStandardV2SettlementChoiceArgument,
  buildTokenStandardV2SettlementCommand,
  prepareTokenStandardV2SettlementCommand,
  TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_INTERFACE_ID,
  TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_SETTLE_BATCH_CHOICE,
  TokenStandardV2SettlementFactoryError,
  TokenStandardV2SettlementFactoryErrorCode,
  type BuildTokenStandardV2SettlementChoiceArgumentParams,
  type TokenStandardV2SettlementRegistryClient,
} from '../../../../src/utils/token-standard/v2';

const settlementParams: BuildTokenStandardV2SettlementChoiceArgumentParams = {
  settlement: {
    executors: ['VenueOperator::1220venue'],
    id: 'settlement-otc-42',
    cid: '#trade-contract',
  },
  transferLegs: [
    {
      transferLegId: 'cash-leg',
      sender: {
        owner: 'Buyer::1220buyer',
        provider: 'BuyerCustodian::1220custodian',
        id: 'cash/primary',
      },
      receiver: {
        owner: 'Seller::1220seller',
        provider: null,
        id: '',
      },
      amount: '125.50',
      instrumentId: 'USDx',
    },
  ],
  allocations: [
    {
      allocationCid: '#buyer-cash-allocation',
      extraTransferLegSides: [
        {
          transferLegId: 'fee-leg',
          side: 'SenderSide',
          otherside: {
            owner: 'VenueOperator::1220venue',
            provider: null,
            id: 'fees',
          },
          amount: '0.25',
          instrumentId: 'USDx',
        },
      ],
      nextIterationFunding: { USDx: '50.0' },
    },
  ],
  actors: ['VenueOperator::1220venue'],
};

function createRegistryClient(response: unknown): TokenStandardV2SettlementRegistryClient & {
  readonly getSettlementFactoryFromRegistry: jest.Mock;
} {
  return {
    getSettlementFactoryFromRegistry: jest.fn(async () => response),
  };
}

describe('Token Standard V2 settlement-factory helpers', () => {
  test('builds the exact SettlementFactory_SettleBatch choice argument and command', () => {
    const choiceArgument = buildTokenStandardV2SettlementChoiceArgument(settlementParams);

    expect(choiceArgument).toEqual({
      settlement: {
        executors: ['VenueOperator::1220venue'],
        id: 'settlement-otc-42',
        cid: '#trade-contract',
        meta: { values: {} },
      },
      transferLegs: [
        {
          transferLegId: 'cash-leg',
          sender: {
            owner: 'Buyer::1220buyer',
            provider: 'BuyerCustodian::1220custodian',
            id: 'cash/primary',
          },
          receiver: {
            owner: 'Seller::1220seller',
            provider: null,
            id: '',
          },
          amount: '125.50',
          instrumentId: 'USDx',
          meta: { values: {} },
        },
      ],
      allocations: [
        {
          allocationCid: '#buyer-cash-allocation',
          extraTransferLegSides: [
            {
              transferLegId: 'fee-leg',
              side: 'SenderSide',
              otherside: {
                owner: 'VenueOperator::1220venue',
                provider: null,
                id: 'fees',
              },
              amount: '0.25',
              instrumentId: 'USDx',
              meta: { values: {} },
            },
          ],
          nextIterationFunding: { USDx: '50.0' },
        },
      ],
      actors: ['VenueOperator::1220venue'],
      extraArgs: {
        context: { values: {} },
        meta: { values: {} },
      },
    });

    expect(
      buildTokenStandardV2SettlementCommand({
        ...settlementParams,
        settlementFactoryContractId: '#cash-settlement-factory',
      })
    ).toEqual({
      ExerciseCommand: {
        templateId: TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_INTERFACE_ID,
        contractId: '#cash-settlement-factory',
        choice: TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_SETTLE_BATCH_CHOICE,
        choiceArgument,
      },
    });
  });

  test('preserves opaque Text identifiers while normalizing parties and CIDs', () => {
    const choiceArgument = buildTokenStandardV2SettlementChoiceArgument({
      settlement: {
        executors: ['  VenueOperator::1220venue  '],
        id: '  opaque settlement id  ',
        cid: '  #trade-contract  ',
      },
      transferLegs: [
        {
          transferLegId: '  opaque leg id  ',
          sender: {
            owner: '  Buyer::1220buyer  ',
            provider: '  BuyerCustodian::1220custodian  ',
            id: '  opaque account id  ',
          },
          receiver: {
            owner: '  Seller::1220seller  ',
            provider: null,
            id: '',
          },
          amount: '125.50',
          instrumentId: '  opaque instrument id  ',
        },
      ],
      allocations: [
        {
          allocationCid: '  #buyer-cash-allocation  ',
          extraTransferLegSides: [
            {
              transferLegId: '  opaque extra leg id  ',
              side: 'SenderSide',
              otherside: {
                owner: '  VenueOperator::1220venue  ',
                provider: null,
                id: '  opaque fee account  ',
              },
              amount: '000.2500',
              instrumentId: '  opaque instrument id  ',
            },
          ],
          nextIterationFunding: { '  opaque instrument id  ': '50.0' },
        },
      ],
      actors: ['  VenueOperator::1220venue  '],
    });

    expect(choiceArgument).toMatchObject({
      settlement: {
        executors: ['VenueOperator::1220venue'],
        id: '  opaque settlement id  ',
        cid: '#trade-contract',
      },
      transferLegs: [
        {
          transferLegId: '  opaque leg id  ',
          sender: {
            owner: 'Buyer::1220buyer',
            provider: 'BuyerCustodian::1220custodian',
            id: '  opaque account id  ',
          },
          receiver: {
            owner: 'Seller::1220seller',
            id: '',
          },
          amount: '125.50',
          instrumentId: '  opaque instrument id  ',
        },
      ],
      allocations: [
        {
          allocationCid: '#buyer-cash-allocation',
          extraTransferLegSides: [
            {
              transferLegId: '  opaque extra leg id  ',
              otherside: {
                owner: 'VenueOperator::1220venue',
                id: '  opaque fee account  ',
              },
              amount: '000.2500',
              instrumentId: '  opaque instrument id  ',
            },
          ],
          nextIterationFunding: { '  opaque instrument id  ': '50.0' },
        },
      ],
      actors: ['VenueOperator::1220venue'],
    });

    const transferLeg = settlementParams.transferLegs[0];
    if (!transferLeg) throw new Error('Expected transfer-leg test fixture');
    const emptyTextIds = buildTokenStandardV2SettlementChoiceArgument({
      ...settlementParams,
      settlement: {
        executors: settlementParams.settlement.executors,
        id: '',
        cid: '#trade-contract',
        meta: { values: { source: 'contract-id' } },
      },
      transferLegs: [
        {
          ...transferLeg,
          transferLegId: '',
          instrumentId: '',
          sender: { ...transferLeg.sender, id: '' },
        },
      ],
    });
    expect(emptyTextIds.settlement.id).toBe('');
    expect(emptyTextIds.transferLegs[0]).toMatchObject({
      transferLegId: '',
      instrumentId: '',
      sender: { id: '' },
    });
  });

  test('requires transferLegId values to be unique across transferLegs', () => {
    const transferLeg = settlementParams.transferLegs[0];
    if (!transferLeg) throw new Error('Expected transfer-leg test fixture');

    let thrown: unknown;
    try {
      buildTokenStandardV2SettlementChoiceArgument({
        ...settlementParams,
        transferLegs: [transferLeg, { ...transferLeg, amount: '1.0' }],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: 'TokenStandardV2SettlementFactoryError',
      code: TokenStandardV2SettlementFactoryErrorCode.INPUT_INVALID,
      context: {
        field: 'transferLegs[1].transferLegId',
        transferLegId: 'cash-leg',
        firstIndex: 0,
      },
    });
  });

  test('enforces positive Daml Numeric 10 amounts and preserves valid decimal text', () => {
    const transferLeg = settlementParams.transferLegs[0];
    const finalizedAllocation = settlementParams.allocations[0];
    const extraTransferLegSide = finalizedAllocation?.extraTransferLegSides?.[0];
    if (!transferLeg || !finalizedAllocation || !extraTransferLegSide) {
      throw new Error('Expected complete settlement amount test fixture');
    }

    const buildWithAmounts = (params: {
      readonly transferAmount?: string;
      readonly extraTransferAmount?: string;
      readonly fundingAmount?: string;
    }): ReturnType<typeof buildTokenStandardV2SettlementChoiceArgument> =>
      buildTokenStandardV2SettlementChoiceArgument({
        ...settlementParams,
        transferLegs: [{ ...transferLeg, amount: params.transferAmount ?? '1.0' }],
        allocations: [
          {
            ...finalizedAllocation,
            extraTransferLegSides: [{ ...extraTransferLegSide, amount: params.extraTransferAmount ?? '1.0' }],
            nextIterationFunding: { USDx: params.fundingAmount ?? '1.0' },
          },
        ],
      });

    const maximumDecimal = `${'9'.repeat(28)}.${'9'.repeat(10)}`;
    for (const amount of ['1', '1.0', '0001.2300', maximumDecimal]) {
      const choiceArgument = buildWithAmounts({
        transferAmount: amount,
        extraTransferAmount: amount,
        fundingAmount: amount,
      });
      expect(choiceArgument.transferLegs[0]?.amount).toBe(amount);
      expect(choiceArgument.allocations[0]?.extraTransferLegSides[0]?.amount).toBe(amount);
      expect(choiceArgument.allocations[0]?.nextIterationFunding?.['USDx']).toBe(amount);
    }

    const invalidTransferAmounts = [
      '0',
      '+0.0',
      '+1.0',
      '-0',
      '-1.0',
      '1.',
      '.1',
      '1e2',
      ' 1.0 ',
      '1\n',
      '1'.repeat(29),
      `1.${'1'.repeat(11)}`,
    ];
    for (const amount of invalidTransferAmounts) {
      expect(() => buildWithAmounts({ transferAmount: amount })).toThrow(TokenStandardV2SettlementFactoryError);
    }
    for (const amount of ['0', '-1.0', '1.']) {
      expect(() => buildWithAmounts({ extraTransferAmount: amount })).toThrow(TokenStandardV2SettlementFactoryError);
      expect(() => buildWithAmounts({ fundingAmount: amount })).toThrow(TokenStandardV2SettlementFactoryError);
    }
  });

  test('clones exact caller ChoiceContext and safely preserves special map keys', () => {
    const context = {
      values: Object.fromEntries([
        ['__proto__', { tag: 'AV_Text', value: 'safe' }],
        ['registry.example/nested', { tag: 'AV_List', value: [{ tag: 'AV_Text', value: 'before' }] }],
      ]),
    };
    const metadataValues = Object.fromEntries([
      ['__proto__', 'metadata-safe'],
      ['constructor', 'metadata-constructor'],
    ]);
    const funding = Object.fromEntries([
      ['__proto__', '1.0'],
      ['USDx', '50.0'],
    ]);

    const choiceArgument = buildTokenStandardV2SettlementChoiceArgument({
      ...settlementParams,
      allocations: [
        {
          allocationCid: '#buyer-cash-allocation',
          nextIterationFunding: funding,
        },
      ],
      extraArgs: {
        context,
        meta: { values: metadataValues },
      },
    });

    expect(choiceArgument.extraArgs.context).toEqual(context);
    expect(choiceArgument.extraArgs.context).not.toBe(context);
    expect(choiceArgument.extraArgs.context.values).not.toBe(context.values);
    expect(choiceArgument.extraArgs.meta.values).toEqual(metadataValues);
    expect(choiceArgument.allocations[0]?.nextIterationFunding).toEqual(funding);
    expect(Object.prototype.hasOwnProperty.call(choiceArgument.extraArgs.context.values, '__proto__')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(choiceArgument.extraArgs.meta.values, '__proto__')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(choiceArgument.allocations[0]?.nextIterationFunding, '__proto__')).toBe(
      true
    );

    const nested = context.values['registry.example/nested'] as {
      value: Array<{ value: string }>;
    };
    const [firstNestedValue] = nested.value;
    if (!firstNestedValue) throw new Error('Expected nested ChoiceContext test fixture');
    firstNestedValue.value = 'after';
    expect(choiceArgument.extraArgs.context.values['registry.example/nested']).toMatchObject({
      value: [{ value: 'before' }],
    });
  });

  test.each([{}, { values: [] }, { values: {}, unexpected: true }, { values: { invalid: undefined } }])(
    'rejects malformed caller ChoiceContext %# with a typed input error',
    (context) => {
      let thrown: unknown;
      try {
        buildTokenStandardV2SettlementChoiceArgument({
          ...settlementParams,
          extraArgs: {
            context: context as never,
            meta: { values: {} },
          },
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        name: 'TokenStandardV2SettlementFactoryError',
        code: TokenStandardV2SettlementFactoryErrorCode.INPUT_INVALID,
      });
    }
  );

  test('looks up with empty extraArgs then combines registry context with caller metadata', async () => {
    const choiceContextData = {
      values: {
        'registry.example/rules': {
          tag: 'AV_ContractId',
          value: '#instrument-rules',
        },
      },
    };
    const metadata = { values: { 'app.example/request-id': 'request-42' } };
    const scan = createRegistryClient({
      factoryId: '#cash-settlement-factory',
      choiceContext: {
        choiceContextData,
        disclosedContracts: [
          {
            templateId: '#cash-package:Cash:InstrumentRules',
            contractId: '#instrument-rules',
            createdEventBlob: 'encoded-created-event',
            synchronizerId: 'global-domain::1220synchronizer',
            debugPackageName: 'cash-package',
            debugPayload: { instrumentId: 'USDx' },
          },
        ],
      },
    });
    const prepared = await prepareTokenStandardV2SettlementCommand({
      ...settlementParams,
      registryUrl: 'https://registry.example/token',
      scan,
      metadata,
    });

    expect(scan.getSettlementFactoryFromRegistry).toHaveBeenCalledTimes(1);
    expect(scan.getSettlementFactoryFromRegistry).toHaveBeenCalledWith({
      registryUrl: 'https://registry.example/token',
      choiceArguments: {
        ...buildTokenStandardV2SettlementChoiceArgument(settlementParams),
        extraArgs: {
          context: { values: {} },
          meta: { values: {} },
        },
      },
      excludeDebugFields: true,
    });
    expect(prepared.settlementFactoryContractId).toBe('#cash-settlement-factory');
    expect(prepared.choiceArgument.extraArgs.context).toEqual(choiceContextData);
    expect(prepared.choiceArgument.extraArgs.context).not.toBe(choiceContextData);
    expect(prepared.choiceArgument.extraArgs.context.values).not.toBe(choiceContextData.values);
    expect(prepared.choiceArgument.extraArgs.meta).toEqual({
      values: { 'app.example/request-id': 'request-42' },
    });
    expect(prepared.choiceArgument.extraArgs.meta).not.toBe(metadata);
    expect(prepared.disclosedContracts).toEqual([
      {
        templateId: '#cash-package:Cash:InstrumentRules',
        contractId: '#instrument-rules',
        createdEventBlob: 'encoded-created-event',
        synchronizerId: 'global-domain::1220synchronizer',
      },
    ]);
    expect(prepared.command).toEqual({
      ExerciseCommand: {
        templateId: TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_INTERFACE_ID,
        contractId: '#cash-settlement-factory',
        choice: TOKEN_STANDARD_V2_SETTLEMENT_FACTORY_SETTLE_BATCH_CHOICE,
        choiceArgument: prepared.choiceArgument,
      },
    });

    choiceContextData.values['registry.example/rules'].value = '#mutated-rules';
    metadata.values['app.example/request-id'] = 'mutated-request';
    expect(prepared.choiceArgument.extraArgs).toMatchObject({
      context: {
        values: {
          'registry.example/rules': { value: '#instrument-rules' },
        },
      },
      meta: { values: { 'app.example/request-id': 'request-42' } },
    });
  });

  test('forwards an explicit false excludeDebugFields override', async () => {
    const scan = createRegistryClient({
      factoryId: '#settlement-factory',
      choiceContext: {
        choiceContextData: { values: {} },
        disclosedContracts: [],
      },
    });

    await prepareTokenStandardV2SettlementCommand({
      ...settlementParams,
      registryUrl: 'https://registry.example',
      scan,
      excludeDebugFields: false,
    });

    expect(scan.getSettlementFactoryFromRegistry).toHaveBeenCalledWith(
      expect.objectContaining({ excludeDebugFields: false })
    );
  });

  test('rejects prepare-time extraArgs so registry context cannot come from the caller', async () => {
    const scan = createRegistryClient({});

    await expect(
      prepareTokenStandardV2SettlementCommand({
        ...settlementParams,
        registryUrl: 'https://registry.example',
        scan,
        // @ts-expect-error prepare intentionally accepts metadata, not caller-provided context
        extraArgs: {
          context: { values: { callerContextMustNotBeAccepted: 'invalid' } },
          meta: { values: {} },
        },
      })
    ).rejects.toMatchObject({
      name: 'TokenStandardV2SettlementFactoryError',
      code: TokenStandardV2SettlementFactoryErrorCode.INPUT_INVALID,
    });
    expect(scan.getSettlementFactoryFromRegistry).not.toHaveBeenCalled();
  });

  test.each([
    null,
    {
      factoryId: '',
      choiceContext: { choiceContextData: { values: {} }, disclosedContracts: [] },
    },
    { factoryId: '#factory', choiceContext: { choiceContextData: {}, disclosedContracts: [] } },
    { factoryId: '#factory', choiceContext: { choiceContextData: { values: [] }, disclosedContracts: [] } },
    {
      factoryId: '#factory',
      choiceContext: { choiceContextData: { values: {}, unexpected: true }, disclosedContracts: [] },
    },
    {
      factoryId: '#factory',
      choiceContext: { choiceContextData: { values: { invalid: undefined } }, disclosedContracts: [] },
    },
    { factoryId: '#factory', choiceContext: { choiceContextData: null, disclosedContracts: [] } },
    { factoryId: '#factory', choiceContext: { choiceContextData: { values: {} }, disclosedContracts: null } },
    {
      factoryId: '#factory',
      choiceContext: {
        choiceContextData: { values: {} },
        disclosedContracts: [
          {
            templateId: '#cash:Cash:Rules',
            contractId: '#rules',
            synchronizerId: 'sync::id',
          },
        ],
      },
    },
  ])('rejects malformed registry response %# with a typed error', async (response) => {
    await expect(
      prepareTokenStandardV2SettlementCommand({
        ...settlementParams,
        registryUrl: 'https://registry.example',
        scan: createRegistryClient(response),
      })
    ).rejects.toMatchObject({
      name: 'TokenStandardV2SettlementFactoryError',
      code: TokenStandardV2SettlementFactoryErrorCode.FACTORY_RESPONSE_INVALID,
    });
  });

  test('rejects malformed inputs before registry lookup with typed errors', async () => {
    const scan = createRegistryClient({});

    expect(() =>
      buildTokenStandardV2SettlementChoiceArgument({
        ...settlementParams,
        settlement: { ...settlementParams.settlement, executors: [] },
      })
    ).toThrow(TokenStandardV2SettlementFactoryError);

    await expect(
      prepareTokenStandardV2SettlementCommand({
        ...settlementParams,
        actors: [],
        registryUrl: 'https://registry.example',
        scan,
      })
    ).rejects.toMatchObject({
      name: 'TokenStandardV2SettlementFactoryError',
      code: TokenStandardV2SettlementFactoryErrorCode.INPUT_INVALID,
    });
    await expect(
      prepareTokenStandardV2SettlementCommand({
        ...settlementParams,
        registryUrl: 'file:///tmp/registry',
        scan,
      })
    ).rejects.toBeInstanceOf(TokenStandardV2SettlementFactoryError);
    expect(() =>
      buildTokenStandardV2SettlementCommand({
        ...settlementParams,
        settlementFactoryContractId: '   ',
      })
    ).toThrow(TokenStandardV2SettlementFactoryError);
    expect(scan.getSettlementFactoryFromRegistry).not.toHaveBeenCalled();
  });
});
