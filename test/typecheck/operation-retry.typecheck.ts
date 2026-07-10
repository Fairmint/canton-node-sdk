import { z } from 'zod';
import type { LedgerJsonApiClient } from '../../src/clients/ledger-json-api/LedgerJsonApiClient.generated';
import type { AllocateExternalPartyParams } from '../../src/clients/ledger-json-api/operations/v2/parties/external/allocate-external-party';
import type { ScanApiClient } from '../../src/clients/scan-api/ScanApiClient.generated';
import type { GetAcsSnapshotAtParams } from '../../src/clients/scan-api/operations/v0/scan';
import type { ValidatorApiClient } from '../../src/clients/validator-api/ValidatorApiClient.generated';
import type { ApiOperationConfig, DeepReadonly } from '../../src/core';

declare const client: LedgerJsonApiClient;
declare const scanClient: ScanApiClient;
declare const validatorClient: ValidatorApiClient;

const signedRequest = {
  synchronizer: 'synchronizer::id',
  identityProviderId: 'default',
  onboardingTransactions: [
    {
      transaction: 'serialized-transaction',
      signatures: [
        {
          format: 'SIGNATURE_FORMAT_RAW',
          signature: 'signature',
          signedBy: 'fingerprint',
          signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
        },
      ],
    },
  ],
} satisfies AllocateExternalPartyParams;

interface NonEmptyTuplePayload {
  readonly values: readonly [string, ...string[]];
}
const validTuplePayload: DeepReadonly<NonEmptyTuplePayload> = { values: ['required'] };
const invalidTuplePayload: DeepReadonly<NonEmptyTuplePayload> = {
  // @ts-expect-error DeepReadonly must preserve non-empty tuple constraints.
  values: [],
};
void validTuplePayload;
void invalidTuplePayload;

void client.allocateExternalParty(signedRequest, {
  retry: {
    kind: 'derived-body',
    maxAttempts: 2,
    deriveParams: ({ params }) => {
      // Generated methods expose the declared union and preserve sound narrowing through its normal discriminants.
      const [transaction] = params.onboardingTransactions;
      if (transaction && 'signatures' in transaction) {
        const signature: string = transaction.signatures[0]?.signature ?? '';
        void signature;
      }
      return signedRequest;
    },
  },
});

void client.allocateExternalParty(signedRequest, {
  retry: {
    kind: 'derived-body',
    maxAttempts: 2,
    deriveParams: ({ params }) => ({
      ...params,
      // Natural shallow copies of deeply readonly retry params remain valid even when nested arrays are unchanged.
      synchronizer: 'replacement-synchronizer::id',
    }),
  },
});

const requestWithCallerOnlyMetadata = { ...signedRequest, callerOnlyMetadata: 'not-on-the-wire' };
void client.allocateExternalParty(requestWithCallerOnlyMetadata, {
  retry: {
    kind: 'exact-body',
    maxAttempts: 1,
    beforeAttempt: ({ params }) => {
      // @ts-expect-error Retry hooks expose validated declared params, not caller-only structural extensions.
      void params.callerOnlyMetadata;
    },
  },
});

void client.allocateExternalParty(signedRequest, {
  retry: {
    kind: 'derived-body',
    maxAttempts: 2,
    // @ts-expect-error Derived params must satisfy the operation's declared request type.
    deriveParams: () => ({ synchronizer: 'missing-required-fields' }),
  },
});

// Generated methods for bodyless endpoints accept transport options without a synthetic request payload.
void client.getVersion({ signal: new AbortController().signal });

// Representative POST reads in every generated client accept the same typed retry/cancellation controls.
void client.completions(
  { userId: 'user', parties: ['party'], beginExclusive: 0 },
  { retry: { kind: 'exact-body', maxAttempts: 2 } }
);
void validatorClient.getTransferOfferStatus(
  { trackingId: 'tracking-id' },
  { retry: { kind: 'exact-body', maxAttempts: 2 } }
);
void scanClient.getAcsSnapshotAt(
  { body: {} as GetAcsSnapshotAtParams['body'] },
  { retry: { kind: 'exact-body', maxAttempts: 2 } }
);

// @ts-expect-error HTTP GET requests cannot be classified as mutations.
void scanClient.makeGetRequest('https://scan.example/api/scan/v0/read', {}, { requestSemantics: 'mutation' });

// @ts-expect-error POST failover must be explicitly classified as a semantic read.
void client.makePostRequest('https://ledger.example/v2/read', {}, {}, { resolveReadAttemptUrl: () => 'next' });

void client.makePostRequest(
  'https://ledger.example/v2/mutate',
  {},
  {},
  // @ts-expect-error Mutation requests cannot install a read endpoint resolver.
  { requestSemantics: 'mutation', resolveReadAttemptUrl: () => 'next' }
);

const invalidGetOperationConfig = {
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (): string => 'https://api.example/read',
  requestSemantics: 'mutation',
  // @ts-expect-error Factory-created GET operations cannot use mutation semantics.
} satisfies ApiOperationConfig<void, unknown>;
void invalidGetOperationConfig;

// Custom ApiOperation subclasses retain their declared params while forwarding the same typed options.
void client.getParties({}, { signal: new AbortController().signal });
void client.listParties({}, { retry: { kind: 'exact-body', maxAttempts: 2 } });
void validatorClient.getMemberTrafficStatus(
  { domainId: 'domain', memberId: 'member' },
  { retry: { kind: 'exact-body', maxAttempts: 2 } }
);
void validatorClient.getMemberTrafficStatus();
void validatorClient.getMemberTrafficStatus(undefined, { signal: new AbortController().signal });
