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
    expect(parseMintedHoldings(response)).toEqual([]);
  });

  it('reads the created holdings when the caller names the enforcement choice that minted them', () => {
    const response = transactionTree([
      { exercised: exercised({ choice: 'BurnHoldingEnforcement', exerciseResult: {} }) },
      { created: created(BURN_OFFER_TEMPLATE, 'cid-offer') },
      { created: created(HOLDING_TEMPLATE, 'cid-reissued') },
    ]);

    expect(
      parseMintedHoldings(response, {
        mintingChoices: ['BurnHoldingEnforcement'],
        holdingTemplate: HOLDING_TEMPLATE,
      })
    ).toEqual(['cid-reissued']);
  });

  it('refuses to call every create a mint when the transaction carries no burn-mint result', () => {
    const response = transactionTree([
      { exercised: exercised({ choice: 'BurnHoldingEnforcement', exerciseResult: {} }) },
      { created: created(BURN_OFFER_TEMPLATE, 'cid-offer') },
      { created: created(HOLDING_TEMPLATE, 'cid-reissued') },
    ]);

    expect(() => parseMintedHoldings(response)).toThrow(/minted nothing/);
  });

  it('refuses the create-event fallback unless both mintingChoices and holdingTemplate are named', () => {
    const response = transactionTree([
      { exercised: exercised({ choice: 'BurnHoldingEnforcement', exerciseResult: {} }) },
      { created: created(BURN_OFFER_TEMPLATE, 'cid-offer') },
      { created: created(HOLDING_TEMPLATE, 'cid-reissued') },
    ]);

    expect(() => parseMintedHoldings(response, { holdingTemplate: HOLDING_TEMPLATE })).toThrow(/minted nothing/);
    expect(() => parseMintedHoldings(response, { mintingChoices: ['BurnHoldingEnforcement'] })).toThrow(
      /minted nothing/
    );
    expect(() => parseMintedHoldings(response, { mintingChoices: [], holdingTemplate: HOLDING_TEMPLATE })).toThrow(
      /minted nothing/
    );
    expect(
      parseMintedHoldings(response, {
        mintingChoices: ['BurnHoldingEnforcement'],
        holdingTemplate: HOLDING_TEMPLATE,
      })
    ).toEqual(['cid-reissued']);
  });

  it('refuses the fallback when none of the named minting choices was exercised', () => {
    const response = transactionTree([
      { exercised: exercised({ choice: TokenStandardV1Choice.transfer, exerciseResult: {} }) },
      { created: created(HOLDING_TEMPLATE, 'cid-change') },
    ]);

    expect(() =>
      parseMintedHoldings(response, {
        mintingChoices: ['BurnHoldingEnforcement'],
        holdingTemplate: HOLDING_TEMPLATE,
      })
    ).toThrow(/nor any of these minting choices/);
  });

  it('reports a pure confiscation as no minted holdings rather than as a failure', () => {
    const response = transactionTree([
      { exercised: exercised({ choice: 'BurnHoldingEnforcement', exerciseResult: {} }) },
      { created: created(BURN_OFFER_TEMPLATE, 'cid-offer') },
    ]);

    expect(
      parseMintedHoldings(response, {
        mintingChoices: ['BurnHoldingEnforcement'],
        holdingTemplate: HOLDING_TEMPLATE,
      })
    ).toEqual([]);
  });

  it('reads a burn-mint result that is not a record as a failure, not as a reason to read the creates', () => {
    const response = transactionTree([
      { exercised: exercised({ choice: TokenStandardV1Choice.burnMint, exerciseResult: 'nonsense' }) },
      { created: created(HOLDING_TEMPLATE, 'cid-created') },
    ]);

    expect(() => parseMintedHoldings(response, { holdingTemplate: HOLDING_TEMPLATE })).toThrow(
      /returned no result record/
    );
  });

  it('says so when the transaction contains no burn-mint at all', () => {
    let thrown: unknown;
    try {
      parseBurnMintResult(transactionTree([{ created: created(HOLDING_TEMPLATE, 'cid-1') }]));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: 'TokenStandardV1ResultError',
      code: TokenStandardV1ResultErrorCode.RESULT_NOT_FOUND,
      context: { updateId: UPDATE_ID },
    });
  });

  it('reports mixed outputCids as invalid rather than dropping the non-strings', () => {
    const response = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.burnMint,
          exerciseResult: { outputCids: ['cid-1', 42] },
        }),
      },
    ]);

    expect(() => parseBurnMintResult(response)).toThrow(/not a list of contract ids/);
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

  it.each([undefined, 42, ''] as const)(
    'refuses a pending transfer whose instruction cid is %j',
    (transferInstructionCid) => {
      const response = transactionTree([
        {
          exercised: exercised({
            choice: TokenStandardV1Choice.transfer,
            exerciseResult: {
              senderChangeCids: ['cid-change'],
              output: { tag: 'TransferInstructionResult_Pending', value: { transferInstructionCid } },
            },
          }),
        },
      ]);

      expect(() => parseTransferResult(response)).toThrow(/no transferInstructionCid/);
    }
  );

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

  it('reports an output tag the standard does not define rather than calling the transfer failed', () => {
    const response = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.transfer,
          exerciseResult: {
            senderChangeCids: ['cid-change'],
            output: { tag: 'TransferInstructionResult_Quantum', value: {} },
          },
        }),
      },
    ]);

    let thrown: unknown;
    try {
      parseTransferResult(response);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: 'TokenStandardV1ResultError',
      code: TokenStandardV1ResultErrorCode.RESULT_INVALID,
      context: { tag: 'TransferInstructionResult_Quantum' },
    });
  });

  it('reports a transfer result that names no output at all', () => {
    const response = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.transferInstructionAccept,
          exerciseResult: { senderChangeCids: [], meta: { values: {} } },
        }),
      },
    ]);

    expect(() => parseTransferResult(response)).toThrow(/transfer result names no output/);
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
      allocationInstructionCid: undefined,
    });
  });

  it.each([undefined, 42, ''] as const)(
    'refuses a completed allocation whose allocation cid is %j',
    (allocationCid) => {
      const response = transactionTree([
        {
          exercised: exercised({
            choice: TokenStandardV1Choice.allocate,
            exerciseResult: {
              senderChangeCids: ['cid-change'],
              output: { tag: 'AllocationInstructionResult_Completed', value: { allocationCid } },
            },
          }),
        },
      ]);

      expect(() => parseAllocationResult(response)).toThrow(/no allocationCid/);
    }
  );

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
      allocationInstructionCid: 'cid-instruction',
    });
  });

  it.each([undefined, 42, ''] as const)(
    'refuses a pending allocation whose instruction cid is %j',
    (allocationInstructionCid) => {
      const response = transactionTree([
        {
          exercised: exercised({
            choice: TokenStandardV1Choice.allocate,
            exerciseResult: {
              senderChangeCids: [],
              output: { tag: 'AllocationInstructionResult_Pending', value: { allocationInstructionCid } },
            },
          }),
        },
      ]);

      expect(() => parseAllocationResult(response)).toThrow(/no allocationInstructionCid/);
    }
  );

  it('reads a rejected allocation as failed, from the standard failed variant', () => {
    const response = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.allocate,
          exerciseResult: {
            senderChangeCids: ['cid-returned'],
            output: { tag: 'AllocationInstructionResult_Failed', value: {} },
          },
        }),
      },
    ]);

    expect(parseAllocationResult(response)).toEqual({
      updateId: UPDATE_ID,
      status: 'failed',
      senderChangeCids: ['cid-returned'],
      allocationCid: undefined,
      allocationInstructionCid: undefined,
    });
  });

  it('reports a missing allocate exercise as a token standard result error, not a parse error', () => {
    let thrown: unknown;
    try {
      parseAllocationResult(transactionTree([{ created: created(HOLDING_TEMPLATE, 'cid-1') }]));
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      name: 'TokenStandardV1ResultError',
      code: TokenStandardV1ResultErrorCode.RESULT_NOT_FOUND,
      context: { updateId: UPDATE_ID },
    });
  });

  it('reports an allocation output tag it does not know rather than calling the allocation failed', () => {
    const response = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.allocate,
          exerciseResult: {
            senderChangeCids: [],
            output: { tag: 'AllocationInstructionResult_Deferred', value: {} },
          },
        }),
      },
    ]);

    expect(() => parseAllocationResult(response)).toThrow(
      /Unknown allocation result output: AllocationInstructionResult_Deferred/
    );
  });

  it('reports an allocation result that names no output at all', () => {
    const response = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.allocate,
          exerciseResult: { senderChangeCids: [], meta: { values: {} } },
        }),
      },
    ]);

    expect(() => parseAllocationResult(response)).toThrow(/allocation result names no output/);
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

  it('reports execute without receiver holdings as invalid, not as an empty delivery', () => {
    const response = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.allocationExecuteTransfer,
          exerciseResult: { senderHoldingCids: [], meta: { values: {} } },
        }),
      },
    ]);

    expect(() => parseAllocationTransferResult(response)).toThrow(/no receiverHoldingCids/);
  });

  it('reports cancel without sender holdings as invalid, not as an empty unwind', () => {
    const response = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.allocationCancel,
          exerciseResult: { receiverHoldingCids: [], meta: { values: {} } },
        }),
      },
    ]);

    expect(() => parseAllocationTransferResult(response)).toThrow(/no senderHoldingCids/);
  });

  it('reports withdraw without sender holdings as invalid, not as an empty unwind', () => {
    const response = transactionTree([
      {
        exercised: exercised({
          choice: TokenStandardV1Choice.allocationWithdraw,
          exerciseResult: { meta: { values: {} } },
        }),
      },
    ]);

    expect(() => parseAllocationTransferResult(response)).toThrow(/no senderHoldingCids/);
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
