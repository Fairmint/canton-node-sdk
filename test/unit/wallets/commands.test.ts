import {
  acceptMintOfferCommand,
  createDaTransferPreapprovalCommand,
  requestBurnCommand,
  transferCommand,
  transferInstructionCommand,
} from '../../../src/wallets/commands';
import { acceptMintOffer, createTransferPreapproval } from '../../../src/da-registry/commands';
import { buildTokenStandardV1TransferCommand } from '../../../src/utils/token-standard/v1/transfer-factory';
import { INSTRUMENT, CONTEXT_VALUES, HOLDER, OPERATOR, OTHER, REGISTRAR } from './helpers';

const context = { values: CONTEXT_VALUES };
const extraArgs = { context: { values: CONTEXT_VALUES }, meta: { values: {} } };

describe('command builders', () => {
  it('accepts a mint offer', () => {
    expect(acceptMintOfferCommand('00offer', context)).toEqual({
      ExerciseCommand: {
        templateId: '#utility-registry-app-v0:Utility.Registry.App.V0.Model.Mint:MintOffer',
        contractId: '00offer',
        choice: 'MintOffer_Accept',
        choiceArgument: { extraArgs },
      },
    });
  });

  it('requests a burn on the allocation factory', () => {
    expect(
      requestBurnCommand({
        allocationFactoryCid: '00factory',
        expectedAdmin: REGISTRAR,
        burn: {
          instrumentId: INSTRUMENT,
          amount: '40.0000000000',
          holder: HOLDER,
          reference: 'redemption-1',
          requestedAt: '2026-11-13T11:59:00.000Z',
          executeBefore: '2026-11-20T12:00:00.000Z',
        },
        holdingCids: ['00h1', '00h2'],
        context,
      })
    ).toEqual({
      ExerciseCommand: {
        templateId: '#utility-registry-app-v0:Utility.Registry.App.V0.Service.AllocationFactory:AllocationFactory',
        contractId: '00factory',
        choice: 'AllocationFactory_RequestBurn',
        choiceArgument: {
          expectedAdmin: REGISTRAR,
          burn: {
            instrumentId: { admin: REGISTRAR, id: 'XMPL' },
            amount: '40.0000000000',
            holder: HOLDER,
            reference: 'redemption-1',
            requestedAt: '2026-11-13T11:59:00.000Z',
            executeBefore: '2026-11-20T12:00:00.000Z',
            meta: { values: {} },
          },
          holdingCids: ['00h1', '00h2'],
          extraArgs,
        },
      },
    });
  });

  it('transfers through the CIP-56 TransferFactory interface', () => {
    const command = transferCommand({
      factoryId: '00factory',
      expectedAdmin: REGISTRAR,
      transfer: {
        sender: HOLDER,
        receiver: OTHER,
        amount: '1.0000000000',
        instrumentId: INSTRUMENT,
        requestedAt: '2026-11-13T12:00:00.000Z',
        executeBefore: '2026-11-14T12:00:00.000Z',
        inputHoldingCids: ['00h1'],
        meta: { values: { 'splice.lfdecentralizedtrust.org/reason': 'memo' } },
      },
      context,
    });
    expect(command).toEqual({
      ExerciseCommand: {
        templateId: '#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory',
        contractId: '00factory',
        choice: 'TransferFactory_Transfer',
        choiceArgument: {
          expectedAdmin: REGISTRAR,
          transfer: {
            sender: HOLDER,
            receiver: OTHER,
            amount: '1.0000000000',
            instrumentId: { admin: REGISTRAR, id: 'XMPL' },
            requestedAt: '2026-11-13T12:00:00.000Z',
            executeBefore: '2026-11-14T12:00:00.000Z',
            inputHoldingCids: ['00h1'],
            meta: {
              values: { 'splice.lfdecentralizedtrust.org/reason': 'memo' },
            },
          },
          extraArgs,
        },
      },
    });
    // The CIP-56 V1 Transfer record has no `lock` field.
    expect(JSON.stringify(command)).not.toContain('lock');
  });

  it.each([
    ['accept', 'TransferInstruction_Accept'],
    ['reject', 'TransferInstruction_Reject'],
    ['withdraw', 'TransferInstruction_Withdraw'],
  ] as const)('%s a transfer instruction', (action, choice) => {
    expect(transferInstructionCommand('00offer', action, context)).toEqual({
      ExerciseCommand: {
        templateId:
          '#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferInstruction',
        contractId: '00offer',
        choice,
        choiceArgument: { extraArgs },
      },
    });
  });

  it('creates a DA transfer preapproval', () => {
    expect(
      createDaTransferPreapprovalCommand({
        operator: OPERATOR,
        receiver: HOLDER,
        instrumentAdmin: REGISTRAR,
        instrumentIds: ['XMPL', 'USD'],
      })
    ).toEqual({
      CreateCommand: {
        templateId: '#utility-registry-app-v0:Utility.Registry.App.V0.Model.TransferPreapproval:TransferPreapproval',
        createArguments: {
          operator: OPERATOR,
          receiver: HOLDER,
          instrumentAdmin: REGISTRAR,
          instrumentAllowances: [{ id: 'XMPL' }, { id: 'USD' }],
        },
      },
    });
  });
});

/**
 * The wallets module keeps its own builders (the SDK's are not browser-safe), so these pin them to the same JSON as the
 * SDK's builders for the same command.
 */
describe('command builders match the SDK builders', () => {
  const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

  it('MintOffer_Accept matches da-registry acceptMintOffer', () => {
    expect(acceptMintOfferCommand('00offer', context)).toEqual(json(acceptMintOffer('00offer', context)));
  });

  it('the DA transfer preapproval matches da-registry createTransferPreapproval', () => {
    expect(
      createDaTransferPreapprovalCommand({
        operator: OPERATOR,
        receiver: HOLDER,
        instrumentAdmin: REGISTRAR,
        instrumentIds: ['XMPL'],
      })
    ).toEqual(json(createTransferPreapproval(OPERATOR, HOLDER, REGISTRAR, ['XMPL'])));
  });

  it('TransferFactory_Transfer matches buildTokenStandardV1TransferCommand', () => {
    const transfer = {
      sender: HOLDER,
      receiver: OTHER,
      amount: '1.5000000000',
      instrumentId: INSTRUMENT,
      requestedAt: '2026-11-13T11:59:00.000Z',
      executeBefore: '2026-11-14T12:00:00.000Z',
      inputHoldingCids: ['00h1', '00h2'],
      meta: { values: { 'splice.lfdecentralizedtrust.org/reason': 'memo' } },
    };
    expect(transferCommand({ factoryId: '00factory', expectedAdmin: REGISTRAR, transfer, context })).toEqual(
      json(
        buildTokenStandardV1TransferCommand({
          transferFactoryContractId: '00factory',
          expectedAdmin: REGISTRAR,
          transfer,
          extraArgs: { context, meta: { values: {} } },
        })
      )
    );
  });
});
