import {
  parseAllocationResult,
  parseAllocationTransferResult,
  parseBurnMintResult,
  parseMintedHoldings,
  parseTransferResult,
  TokenStandardV1Choice,
  TokenStandardV1ResultErrorCode,
} from '../../../../src/utils/token-standard/v1';
import {
  BURN_OFFER_TEMPLATE,
  created,
  exercised,
  flatTransaction,
  flattenedTransaction,
  HOLDING_TEMPLATE,
  transactionTree,
  UPDATE_ID,
} from './transactions-fixture';

describe('token standard v1 burn-mint results', () => {
  it('names the minted holdings in output order, from the exercise result rather than the creates', () => {
    const response = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.burnMint,
          exerciseResult: { outputCids: ['cid-out-1', 'cid-out-2'] },
        }),
      },
      { created: created(HOLDING_TEMPLATE, 'cid-out-1') },
      { created: created(HOLDING_TEMPLATE, 'cid-out-2') },
    ]);

    expect(parseBurnMintResult(response)).toEqual({
      updateId: UPDATE_ID,
      outputHoldingCids: ['cid-out-1', 'cid-out-2'],
    });
    expect(parseMintedHoldings(response)).toEqual(['cid-out-1', 'cid-out-2']);
  });

  it('reads a burn as an empty output list, not as a missing result', () => {
    const response = transactionTree([
      { exercised: exercised({ choice: 'Accept' }) },
      { exercised: exercised({ choice: TokenStandardV1Choice.burnMint, exerciseResult: { outputCids: [] } }) },
    ]);

    expect(parseBurnMintResult(response).outputHoldingCids).toEqual([]);
  });

  it('falls back to the created holdings when the mint went through an enforcement action', () => {
    const response = transactionTree([
      { exercised: exercised({ choice: 'BurnHoldingEnforcement', exerciseResult: {} }) },
      { created: created(BURN_OFFER_TEMPLATE, 'cid-offer') },
      { created: created(HOLDING_TEMPLATE, 'cid-reissued') },
    ]);

    expect(parseMintedHoldings(response, { holdingTemplate: HOLDING_TEMPLATE })).toEqual(['cid-reissued']);
    expect(parseMintedHoldings(response)).toEqual(['cid-offer', 'cid-reissued']);
  });

  it('says so when the transaction contains no burn-mint at all', () => {
    expect(() => parseBurnMintResult(transactionTree([{ created: created(HOLDING_TEMPLATE, 'cid-1') }]))).toThrow(
      /no BurnMintFactory_BurnMint exercise/
    );
  });

  it('reports a burn-mint result that names no outputCids', () => {
    const response = transactionTree([
      { exercised: exercised({ choice: TokenStandardV1Choice.burnMint, exerciseResult: { meta: { values: {} } } }) },
    ]);

    expect(() => parseBurnMintResult(response)).toThrow(/no outputCids/);
  });
});

describe('token standard v1 transfer results', () => {
  it('reads a completed transfer, from any of the five choices that return one', () => {
    const response = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.transferInstructionAccept,
          exerciseResult: {
            senderChangeCids: [],
            output: { tag: 'TransferInstructionResult_Completed', value: { receiverHoldingCids: ['cid-receiver'] } },
            meta: { values: {} },
          },
        }),
      },
    ]);

    expect(parseTransferResult(response)).toEqual({
      updateId: UPDATE_ID,
      status: 'completed',
      senderChangeCids: [],
      receiverHoldingCids: ['cid-receiver'],
      transferInstructionCid: undefined,
    });
  });

  it('names the pending offer, and the change that went back to the sender with it', () => {
    const response = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.transfer,
          exerciseResult: {
            senderChangeCids: ['cid-change'],
            output: { tag: 'TransferInstructionResult_Pending', value: { transferInstructionCid: 'cid-instruction' } },
            meta: { values: {} },
          },
        }),
      },
    ]);

    expect(parseTransferResult(response)).toEqual({
      updateId: UPDATE_ID,
      status: 'pending',
      senderChangeCids: ['cid-change'],
      receiverHoldingCids: [],
      transferInstructionCid: 'cid-instruction',
    });
  });

  it('reads a return path as failed, with the returned units as sender change', () => {
    const response = flatTransaction([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.transferInstructionReject,
          exerciseResult: {
            senderChangeCids: ['cid-returned'],
            output: { tag: 'TransferInstructionResult_Failed', value: {} },
            meta: { values: {} },
          },
        }),
      },
    ]);
    const result = parseTransferResult(response);

    expect(result.status).toBe('failed');
    expect(result.senderChangeCids).toEqual(['cid-returned']);
    expect(result.receiverHoldingCids).toEqual([]);
  });

  it('reads the same result out of a flattened submit-and-wait response', () => {
    const response = flattenedTransaction([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.transferInstructionWithdraw,
          exerciseResult: {
            senderChangeCids: ['cid-returned'],
            output: { tag: 'TransferInstructionResult_Failed', value: {} },
            meta: { values: {} },
          },
        }),
      },
    ]);

    expect(parseTransferResult(response).senderChangeCids).toEqual(['cid-returned']);
  });

  it('says so when the transaction contains no transfer result', () => {
    const response = transactionTree([{ created: created(HOLDING_TEMPLATE, 'cid-1') }]);

    expect(() => parseTransferResult(response)).toThrow(/contains none of these exercises/);
  });
});

describe('token standard v1 allocation results', () => {
  it('names the allocation the units are reserved under', () => {
    const response = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.allocate,
          exerciseResult: {
            senderChangeCids: ['cid-change'],
            output: { tag: 'AllocationInstructionResult_Completed', value: { allocationCid: 'cid-allocation' } },
            meta: { values: {} },
          },
        }),
      },
    ]);

    expect(parseAllocationResult(response)).toEqual({
      updateId: UPDATE_ID,
      status: 'completed',
      senderChangeCids: ['cid-change'],
      allocationCid: 'cid-allocation',
    });
  });

  it('reads a pending allocation instruction without an allocation', () => {
    const response = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.allocate,
          exerciseResult: {
            senderChangeCids: [],
            output: {
              tag: 'AllocationInstructionResult_Pending',
              value: { allocationInstructionCid: 'cid-instruction' },
            },
          },
        }),
      },
    ]);

    expect(parseAllocationResult(response)).toEqual({
      updateId: UPDATE_ID,
      status: 'pending',
      senderChangeCids: [],
      allocationCid: undefined,
    });
  });

  it('reads delivery and unwinding through the same result, which differ only in who gets the holdings', () => {
    const executed = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.allocationExecuteTransfer,
          exerciseResult: { senderHoldingCids: [], receiverHoldingCids: ['cid-receiver'], meta: { values: {} } },
        }),
      },
    ]);
    const cancelled = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.allocationCancel,
          exerciseResult: { senderHoldingCids: ['cid-returned'], meta: { values: {} } },
        }),
      },
    ]);

    expect(parseAllocationTransferResult(executed)).toEqual({
      updateId: UPDATE_ID,
      senderHoldingCids: [],
      receiverHoldingCids: ['cid-receiver'],
    });
    expect(parseAllocationTransferResult(cancelled)).toEqual({
      updateId: UPDATE_ID,
      senderHoldingCids: ['cid-returned'],
      receiverHoldingCids: [],
    });
  });

  it('reports a result that is not a record rather than reading fields off it', () => {
    const response = transactionTree([
      { exercised: exercised({ choice: TokenStandardV1Choice.allocationWithdraw, exerciseResult: 'nonsense' }) },
    ]);

    expect(() => parseAllocationTransferResult(response)).toThrow(/returned no result record/);
  });

  it('carries the token standard v1 error code on a missing result', () => {
    const response = transactionTree([{ created: created(HOLDING_TEMPLATE, 'cid-1') }]);

    let thrown: unknown;
    try {
      parseAllocationTransferResult(response);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: 'TokenStandardV1ResultError',
      code: TokenStandardV1ResultErrorCode.RESULT_NOT_FOUND,
      context: { updateId: UPDATE_ID },
    });
  });
});
