import {
  TransactionShape,
  buildEventFormat,
  buildTransactionFormat,
  buildUpdateFormat,
  type EventFormatBuilderParams,
  type LedgerJsonApiClient,
  type SubmitAndWaitForTransactionParams,
  type TransactionFormatBuilderParams,
  type UpdateFormatBuilderParams,
} from '../../src';

declare const ledgerClient: LedgerJsonApiClient;

type GetUpdateByOffsetParams = Parameters<LedgerJsonApiClient['getUpdateByOffset']>[0];
type GetUpdateByIdParams = Parameters<LedgerJsonApiClient['getUpdateById']>[0];
type SubscribeToUpdatesParams = Parameters<LedgerJsonApiClient['subscribeToUpdates']>[0];

const OCF_OBJECT = '#OpenCapTableApi-v01:Fairmint.OpenCapTableApi.OcfObject:OcfObject';
const REGISTER_CONTRACT = '#OpenCapTableApi-v01:Fairmint.OpenCapTableApi.RegisterContract:RegisterContract';

const eventFormatParams: EventFormatBuilderParams = { parties: ['Alice'], interfaceIds: [OCF_OBJECT] };
const transactionFormatParams: TransactionFormatBuilderParams = {
  ...eventFormatParams,
  transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
};
const updateFormatParams: UpdateFormatBuilderParams = {
  ...transactionFormatParams,
  includeReassignments: false,
  includeTopologyEvents: true,
};

// The builder output is accepted by the reads and submissions it is meant for.
const updateFormat: GetUpdateByOffsetParams['updateFormat'] = buildUpdateFormat(updateFormatParams);
const transactionFormat: SubmitAndWaitForTransactionParams['transactionFormat'] =
  buildTransactionFormat(transactionFormatParams);
const eventFormatVerbose: boolean = buildEventFormat(eventFormatParams).verbose;

// The exported enum is accepted where the literal shape is expected.
const shapeFromEnum: TransactionFormatBuilderParams = {
  parties: ['Alice'],
  transactionShape: TransactionShape.TRANSACTION_SHAPE_LEDGER_EFFECTS,
};

const subscribeParams: SubscribeToUpdatesParams = {
  parties: ['Alice'],
  interfaceIds: [OCF_OBJECT, REGISTER_CONTRACT],
  includeInterfaceView: true,
  includeCreatedEventBlob: false,
  transactionShape: TransactionShape.TRANSACTION_SHAPE_ACS_DELTA,
};

const subscribeParamsWithBadInterfaceIds: SubscribeToUpdatesParams = {
  // @ts-expect-error interfaceIds is a list of interface IDs.
  interfaceIds: 'x',
};

const updateByIdParams: GetUpdateByIdParams = {
  updateId: '1220abc',
  readAs: ['Alice'],
  templateIds: ['#splice-wallet:Splice.Wallet.Install:WalletAppInstall'],
  interfaceIds: [OCF_OBJECT],
  includeInterfaceView: true,
  includeCreatedEventBlob: true,
  transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
};

const updateByIdUnfiltered: GetUpdateByIdParams = { updateId: '1220abc', readAs: [] };

// @ts-expect-error updateId and readAs stay required.
const updateByIdMissingReadAs: GetUpdateByIdParams = { updateId: '1220abc' };

const updateByIdWithBadInterfaceIds: GetUpdateByIdParams = {
  updateId: '1220abc',
  readAs: [],
  // @ts-expect-error interfaceIds is a list of interface IDs.
  interfaceIds: 'x',
};

const updateByIdWithBadShape: GetUpdateByIdParams = {
  updateId: '1220abc',
  readAs: [],
  // @ts-expect-error transactionShape is one of the two ledger shapes.
  transactionShape: 'TRANSACTION_SHAPE_UNKNOWN',
};

const buildersRejectBadInterfaceIds: EventFormatBuilderParams = {
  parties: ['Alice'],
  // @ts-expect-error interfaceIds is a list of interface IDs.
  interfaceIds: 'x',
};

export async function typecheckLedgerInterfaceFilters(): Promise<void> {
  await ledgerClient.getUpdateByOffset({ offset: 1, updateFormat });
  await ledgerClient.getUpdateById(updateByIdParams);
  await ledgerClient.subscribeToUpdates(subscribeParams);
}

transactionFormat;
eventFormatVerbose;
shapeFromEnum;
subscribeParamsWithBadInterfaceIds;
updateByIdUnfiltered;
updateByIdMissingReadAs;
updateByIdWithBadInterfaceIds;
updateByIdWithBadShape;
buildersRejectBadInterfaceIds;
