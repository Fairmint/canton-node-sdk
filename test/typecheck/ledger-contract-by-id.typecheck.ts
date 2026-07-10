import type { GetContractByIdParams, LedgerCreatedEvent, LedgerJsonApiClient, LedgerJsonValue } from '../../src';

declare const ledgerClient: LedgerJsonApiClient;

type ContractByIdOptions = Parameters<LedgerJsonApiClient['getContractById']>[1];
type ContractByIdResponse = Awaited<ReturnType<LedgerJsonApiClient['getContractById']>>;

const request: GetContractByIdParams = {
  contractId: '00contract-id',
  queryingParties: ['validator::fingerprint'],
};

const requestWithoutParties: GetContractByIdParams = {
  contractId: '00contract-id',
};

const requestWithUnknownField: GetContractByIdParams = {
  contractId: '00contract-id',
  // @ts-expect-error Contract lookup accepts only the exact pinned request fields.
  unsupported: true,
};

// @ts-expect-error exactOptionalPropertyTypes requires omission instead of explicit undefined.
const requestWithUndefinedOptional: GetContractByIdParams = {
  contractId: '00contract-id',
  queryingParties: undefined,
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
const { createdEvent }: { createdEvent: LedgerCreatedEvent } = response;
const { createArgument }: { createArgument: LedgerJsonValue } = createdEvent;
const { contractKey: optionalContractKey }: { contractKey?: LedgerJsonValue } = createdEvent;

// @ts-expect-error Daml values must be losslessly representable JSON.
const invalidCreateArgument: LedgerCreatedEvent['createArgument'] = {
  callback: () => undefined,
};

// @ts-expect-error A present contract key cannot be top-level JSON null.
const invalidContractKey: NonNullable<LedgerCreatedEvent['contractKey']> = null;

void ledgerClient.getContractById(request, exactBodyRetry);
void ledgerClient.getContractById(requestWithoutParties, derivedBodyRetry);
void requestWithUnknownField;
void requestWithUndefinedOptional;
void createArgument;
void optionalContractKey;
void invalidCreateArgument;
void invalidContractKey;
