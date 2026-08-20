import {
  buildTokenStandardV1TransferChoiceArgument,
  buildTokenStandardV1TransferCommand,
  TOKEN_STANDARD_V1_TRANSFER_FACTORY_INTERFACE_ID,
  TokenStandardV1Choice,
  TokenStandardV1TransferFactoryError,
  type BuildTokenStandardV1TransferChoiceArgumentParams,
} from '../../../../src/utils/token-standard';

const transferParams: BuildTokenStandardV1TransferChoiceArgumentParams = {
  expectedAdmin: 'CashAdmin::issuer',
  transfer: {
    sender: 'Buyer::alice',
    receiver: 'Seller::bob',
    amount: '25.50',
    instrumentId: {
      admin: 'CashAdmin::issuer',
      id: 'USD',
    },
    requestedAt: '2026-07-10T01:00:00.000Z',
    executeBefore: '2026-07-10T02:00:00.000Z',
    inputHoldingCids: ['#cash-holding'],
  },
};

describe('Token Standard V1 transfer-factory helpers', () => {
  test('builds the exact TransferFactory_Transfer choice argument and command', () => {
    const choiceArgument = buildTokenStandardV1TransferChoiceArgument(transferParams);

    expect(choiceArgument).toEqual({
      expectedAdmin: 'CashAdmin::issuer',
      transfer: {
        sender: 'Buyer::alice',
        receiver: 'Seller::bob',
        amount: '25.50',
        instrumentId: {
          admin: 'CashAdmin::issuer',
          id: 'USD',
        },
        requestedAt: '2026-07-10T01:00:00.000Z',
        executeBefore: '2026-07-10T02:00:00.000Z',
        inputHoldingCids: ['#cash-holding'],
        meta: { values: {} },
      },
      extraArgs: {
        context: { values: {} },
        meta: { values: {} },
      },
    });

    expect(
      buildTokenStandardV1TransferCommand({
        ...transferParams,
        transferFactoryContractId: '#transfer-factory',
      })
    ).toEqual({
      ExerciseCommand: {
        templateId: TOKEN_STANDARD_V1_TRANSFER_FACTORY_INTERFACE_ID,
        contractId: '#transfer-factory',
        choice: TokenStandardV1Choice.transfer,
        choiceArgument,
      },
    });
    expect(TokenStandardV1Choice.transfer).toBe('TransferFactory_Transfer');
  });

  test('allows empty input holdings and preserves extraArgs plus transfer metadata', () => {
    const choiceArgument = buildTokenStandardV1TransferChoiceArgument({
      expectedAdmin: 'CashAdmin::issuer',
      transfer: {
        ...transferParams.transfer,
        inputHoldingCids: [],
        meta: { values: { reason: 'self-merge' } },
      },
      extraArgs: {
        context: { values: { factoryHint: 'registry' } },
        meta: { values: { source: 'wallet' } },
      },
    });

    expect(choiceArgument.transfer.inputHoldingCids).toEqual([]);
    expect(choiceArgument.transfer.meta).toEqual({ values: { reason: 'self-merge' } });
    expect(choiceArgument.extraArgs).toEqual({
      context: { values: { factoryHint: 'registry' } },
      meta: { values: { source: 'wallet' } },
    });
    expect(Object.getPrototypeOf(choiceArgument.extraArgs.context.values)).toBeNull();
    expect(Object.getPrototypeOf(choiceArgument.extraArgs.meta.values)).toBeNull();
  });

  test('trims parties and contract ids while preserving opaque instrument identifiers', () => {
    const choiceArgument = buildTokenStandardV1TransferChoiceArgument({
      expectedAdmin: '  CashAdmin::issuer  ',
      transfer: {
        sender: '  Buyer::alice  ',
        receiver: '  Seller::bob  ',
        amount: '  10.0  ',
        instrumentId: {
          admin: '  CashAdmin::issuer  ',
          id: '  opaque instrument id  ',
        },
        requestedAt: '  2026-07-10T01:00:00.000Z  ',
        executeBefore: '  2026-07-10T02:00:00.000Z  ',
        inputHoldingCids: ['  #cash-holding  '],
      },
    });

    expect(choiceArgument.expectedAdmin).toBe('CashAdmin::issuer');
    expect(choiceArgument.transfer.sender).toBe('Buyer::alice');
    expect(choiceArgument.transfer.receiver).toBe('Seller::bob');
    expect(choiceArgument.transfer.amount).toBe('10.0');
    expect(choiceArgument.transfer.instrumentId).toEqual({
      admin: 'CashAdmin::issuer',
      id: '  opaque instrument id  ',
    });
    expect(choiceArgument.transfer.requestedAt).toBe('2026-07-10T01:00:00.000Z');
    expect(choiceArgument.transfer.executeBefore).toBe('2026-07-10T02:00:00.000Z');
    expect(choiceArgument.transfer.inputHoldingCids).toEqual(['#cash-holding']);
  });

  test('omits unknown caller properties from the ledger choice argument', () => {
    const choiceArgument = buildTokenStandardV1TransferChoiceArgument({
      ...transferParams,
      callerOnlyField: 'must-not-reach-canton',
      transfer: {
        ...transferParams.transfer,
        callerOnlyTransferField: 'must-not-reach-canton',
      },
    } as unknown as BuildTokenStandardV1TransferChoiceArgumentParams);

    expect(choiceArgument).not.toHaveProperty('callerOnlyField');
    expect(choiceArgument.transfer).not.toHaveProperty('callerOnlyTransferField');
  });

  test('rejects malformed runtime objects with typed input errors', () => {
    const malformedParams: readonly unknown[] = [
      null,
      undefined,
      { ...transferParams, expectedAdmin: '' },
      { ...transferParams, expectedAdmin: '   ' },
      { ...transferParams, transfer: null },
      { ...transferParams, extraArgs: null },
      { ...transferParams, transfer: { ...transferParams.transfer, sender: '' } },
      { ...transferParams, transfer: { ...transferParams.transfer, receiver: 42 } },
      { ...transferParams, transfer: { ...transferParams.transfer, amount: '0' } },
      { ...transferParams, transfer: { ...transferParams.transfer, amount: '-1.0' } },
      { ...transferParams, transfer: { ...transferParams.transfer, amount: 'not-a-decimal' } },
      { ...transferParams, transfer: { ...transferParams.transfer, instrumentId: null } },
      {
        ...transferParams,
        transfer: { ...transferParams.transfer, instrumentId: { admin: '', id: 'USD' } },
      },
      { ...transferParams, transfer: { ...transferParams.transfer, requestedAt: '' } },
      { ...transferParams, transfer: { ...transferParams.transfer, executeBefore: '' } },
      { ...transferParams, transfer: { ...transferParams.transfer, inputHoldingCids: 'cid' } },
      { ...transferParams, transfer: { ...transferParams.transfer, inputHoldingCids: [''] } },
      { ...transferParams, transfer: { ...transferParams.transfer, meta: null } },
      {
        ...transferParams,
        extraArgs: { context: { values: {} } },
      },
    ];

    for (const value of malformedParams) {
      let error: unknown;
      try {
        buildTokenStandardV1TransferChoiceArgument(value as BuildTokenStandardV1TransferChoiceArgumentParams);
      } catch (caught) {
        error = caught;
      }
      expect(error).toMatchObject({
        name: 'TokenStandardV1TransferFactoryError',
        code: 'TOKEN_STANDARD_V1_TRANSFER_FACTORY_INPUT_INVALID',
      });
      expect(error).toBeInstanceOf(TokenStandardV1TransferFactoryError);
    }
  });

  test('rejects a missing transfer factory contract id before building the command', () => {
    expect(() =>
      buildTokenStandardV1TransferCommand({
        ...transferParams,
        transferFactoryContractId: '  ',
      })
    ).toThrow(TokenStandardV1TransferFactoryError);
  });
});
