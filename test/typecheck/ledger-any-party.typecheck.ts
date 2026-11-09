import {
  assertCanReadAsAnyParty,
  buildEventFormat,
  buildUpdateFormat,
  type AnyPartyEventFormatBuilderParams,
  type AnyPartyUpdateFormatBuilderParams,
  type EventFormatBuilderParams,
  type LedgerJsonApiClient,
  type PartyScope,
  type RawStreamSubscription,
  type RawUpdatesPage,
  type UpdateFormatBuilderParams,
} from '../../src';

declare const ledgerClient: LedgerJsonApiClient;

type SubscribeToUpdatesParams = Parameters<LedgerJsonApiClient['subscribeToUpdates']>[0];
type GetUpdateByIdParams = Parameters<LedgerJsonApiClient['getUpdateById']>[0];
type GetActiveContractsParams = Parameters<LedgerJsonApiClient['getActiveContracts']>[0];
type StreamActiveContractsParams = Parameters<LedgerJsonApiClient['streamActiveContracts']>[0];
type EventsByContractIdParams = Parameters<LedgerJsonApiClient['getEventsByContractId']>[0];
type SubscribeToRawUpdatesParams = Parameters<LedgerJsonApiClient['subscribeToRawUpdates']>[0];
type SubscribeToRawCompletionsParams = Parameters<LedgerJsonApiClient['subscribeToRawCompletions']>[0];

// Either form is accepted.
const anyParty: PartyScope = { anyParty: true };
const listed: PartyScope = { parties: ['Alice'] };
const anyPartyFormat: AnyPartyEventFormatBuilderParams = {
  anyParty: true,
  includeCreatedEventBlob: true,
  verbose: true,
};
const rawIngesterFormat: AnyPartyUpdateFormatBuilderParams = { anyParty: true, includeTopologyEvents: true };
const listedFormat: UpdateFormatBuilderParams = { parties: ['Alice'], includeTopologyEvents: true };
const subscribeAnyParty: SubscribeToUpdatesParams = { anyParty: true, beginExclusive: 1 };
const updateByIdAnyParty: GetUpdateByIdParams = { updateId: '1220abc', anyParty: true };
const acsAnyParty: GetActiveContractsParams = { anyParty: true, activeAtOffset: 1 };
const acsStreamAnyParty: StreamActiveContractsParams = { anyParty: true };
const eventsAnyParty: EventsByContractIdParams = { contractId: '00abc', anyParty: true };

// Both forms at once are rejected everywhere.
// @ts-expect-error parties and anyParty exclude each other.
const bothScope: PartyScope = { anyParty: true, parties: ['Alice'] };
// @ts-expect-error parties and anyParty exclude each other.
const bothFormat: EventFormatBuilderParams = { anyParty: true, parties: ['Alice'] };
// @ts-expect-error parties and anyParty exclude each other.
const bothAnyPartyFormat: AnyPartyEventFormatBuilderParams = { anyParty: true, parties: ['Alice'] };
// @ts-expect-error parties and anyParty exclude each other.
const bothSubscribe: SubscribeToUpdatesParams = { anyParty: true, parties: ['Alice'] };
// @ts-expect-error readAs and anyParty exclude each other.
const bothUpdateById: GetUpdateByIdParams = { updateId: '1220abc', anyParty: true, readAs: ['Alice'] };
// @ts-expect-error parties and anyParty exclude each other.
const bothAcs: GetActiveContractsParams = { anyParty: true, parties: ['Alice'] };
// @ts-expect-error parties and anyParty exclude each other.
const bothAcsStream: StreamActiveContractsParams = { anyParty: true, parties: ['Alice'] };
// @ts-expect-error readAs and anyParty exclude each other.
const bothEvents: EventsByContractIdParams = { contractId: '00abc', anyParty: true, readAs: ['Alice'] };

// anyParty is `true` or absent.
// @ts-expect-error anyParty: false is not a scope.
const anyPartyFalse: PartyScope = { anyParty: false };
// @ts-expect-error anyParty: false is not a scope.
const subscribeAnyPartyFalse: SubscribeToUpdatesParams = { anyParty: false };

// The party-list builder types keep their original shape: extendable, mutable, with a required parties list.
export interface ExtendedEventFormatParams extends EventFormatBuilderParams {
  readonly label: string;
}
export function addTemplate(params: UpdateFormatBuilderParams): number {
  params.templateIds = ['pkg:Mod:T'];
  params.parties.push('Bob');
  return params.parties.length;
}

// The raw streams take explicit inputs: no default party list, user or offset.
// @ts-expect-error the raw completions stream needs a userId and parties.
const completionsWithoutUser: SubscribeToRawCompletionsParams = { beginExclusive: 1, onFrame: () => undefined };
// @ts-expect-error the raw update stream needs an update format and a beginExclusive.
const rawUpdatesWithoutFormat: SubscribeToRawUpdatesParams = { onFrame: () => undefined };

export async function typecheckAnyPartyReads(): Promise<void> {
  const rights = await assertCanReadAsAnyParty(ledgerClient);
  const { userId }: { userId: string } = rights;
  const updateFormat = buildUpdateFormat({
    anyParty: true,
    includeCreatedEventBlob: true,
    includeTopologyEvents: true,
  });
  const page: RawUpdatesPage = await ledgerClient.getRawUpdatesPage({ updateFormat, beginOffsetExclusive: 1 });
  const { text }: { text: string } = page;
  const stream: RawStreamSubscription = ledgerClient.subscribeToRawUpdates({
    updateFormat,
    beginExclusive: page.highestPageOffsetInclusive,
    onFrame: async (frame) => {
      const { kind, offset }: { kind: string; offset: number | undefined } = frame;
      await Promise.resolve([kind, offset, frame.text, frame.json]);
    },
  });
  const end = await stream.done;
  const { lastOffset: resumeFrom }: { lastOffset: number } = end;
  ledgerClient.subscribeToRawCompletions({
    userId,
    parties: ['Alice'],
    beginExclusive: resumeFrom,
    onFrame: () => undefined,
  });
  buildEventFormat(anyPartyFormat);
  buildUpdateFormat(rawIngesterFormat);
  buildUpdateFormat(listedFormat);
  // @ts-expect-error parties and anyParty exclude each other, in the builders too.
  buildUpdateFormat({ anyParty: true, parties: ['Alice'], includeTopologyEvents: true });
  await Promise.resolve(text);
}

anyParty;
listed;
rawIngesterFormat;
subscribeAnyParty;
updateByIdAnyParty;
acsAnyParty;
acsStreamAnyParty;
eventsAnyParty;
bothScope;
bothFormat;
bothAnyPartyFormat;
bothSubscribe;
bothUpdateById;
bothAcs;
bothAcsStream;
bothEvents;
anyPartyFalse;
subscribeAnyPartyFalse;
completionsWithoutUser;
rawUpdatesWithoutFormat;
