import {
  ContractId,
  PartyId,
  type GetContractByIdCreatedEvent,
  type GetContractByIdParams,
  type LedgerJsonApiClient,
  type LedgerJsonValue,
} from '../../src';

declare const ledgerClient: LedgerJsonApiClient;

type ContractByIdOptions = Parameters<LedgerJsonApiClient['getContractById']>[1];
type ContractByIdResponse = Awaited<ReturnType<LedgerJsonApiClient['getContractById']>>;

const contractId = ContractId(`00${'ab'.repeat(32)}`);
const partyId = PartyId('validator::fingerprint');

const request: GetContractByIdParams = {
  contractId,
  queryingParties: [partyId],
};

const requestWithoutParties: GetContractByIdParams = {
  contractId,
};

const requestWithUnknownField: GetContractByIdParams = {
  contractId,
  // @ts-expect-error Contract lookup accepts only the exact pinned request fields.
  unsupported: true,
};

// @ts-expect-error exactOptionalPropertyTypes requires omission instead of explicit undefined.
const requestWithUndefinedOptional: GetContractByIdParams = {
  contractId,
  queryingParties: undefined,
};

const requestWithPlainString: GetContractByIdParams = {
  // @ts-expect-error Contract IDs must be validated and branded.
  contractId: `00${'ab'.repeat(32)}`,
};

const requestWithPartyAsContract: GetContractByIdParams = {
  // @ts-expect-error A PartyId cannot be used as a ContractId.
  contractId: partyId,
};

const requestWithContractAsParty: GetContractByIdParams = {
  contractId,
  // @ts-expect-error A ContractId cannot be used as a PartyId.
  queryingParties: [contractId],
};

const exactBodyRetry: ContractByIdOptions = {
  retry: {
    kind: 'exact-body',
    maxAttempts: 2,
  },
};

const derivedBodyRetry: ContractByIdOptions = {
  retry: {
    kind: 'derived-body',
    maxAttempts: 2,
    deriveParams: ({ params }) => ({
      contractId: params.contractId,
      ...(params.queryingParties !== undefined ? { queryingParties: [...params.queryingParties] } : {}),
    }),
  },
};

declare const response: ContractByIdResponse;
const { createdEvent }: { createdEvent: GetContractByIdCreatedEvent } = response;
const { createArgument }: { createArgument: LedgerJsonValue } = createdEvent;
const { contractKey: optionalContractKey }: { contractKey?: LedgerJsonValue } = createdEvent;
const responseContractId: ContractId = createdEvent.contractId;
const responseWitness: PartyId | undefined = createdEvent.witnessParties[0];
const nullContractKey: GetContractByIdCreatedEvent['contractKey'] = null;

// @ts-expect-error Daml values must be losslessly representable JSON.
const invalidCreateArgument: GetContractByIdCreatedEvent['createArgument'] = {
  callback: () => undefined,
};

// @ts-expect-error Synthetic contract-service offsets are not exposed publicly.
createdEvent.offset;

void ledgerClient.getContractById(request, exactBodyRetry);
void ledgerClient.getContractById(requestWithoutParties, derivedBodyRetry);
void requestWithUnknownField;
void requestWithUndefinedOptional;
void requestWithPlainString;
void requestWithPartyAsContract;
void requestWithContractAsParty;
void createArgument;
void optionalContractKey;
void responseContractId;
void responseWitness;
void nullContractKey;
void invalidCreateArgument;
