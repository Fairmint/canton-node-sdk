import { z } from 'zod';

import { createApiOperation } from '../../../../core';
import { type operations } from '../../../../generated/apps/scan/src/main/openapi/scan';

const publicRequestConfig = { contentType: 'application/json', includeBearerToken: false } as const;

function toQueryString(params: URLSearchParams): string {
  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : '';
}

/** Common (ref'd) health endpoints */
export const GetHealthStatus = createApiOperation<
  void,
  operations['getHealthStatus']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/status`,
  requestConfig: publicRequestConfig,
});

export const GetVersion = createApiOperation<
  void,
  operations['getVersion']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/version`,
  requestConfig: publicRequestConfig,
});

export const IsReady = createApiOperation<void, void>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/readyz`,
  requestConfig: publicRequestConfig,
});

export const IsLive = createApiOperation<void, void>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/livez`,
  requestConfig: publicRequestConfig,
});

/** Scan endpoints */
export const GetDsoInfo = createApiOperation<
  void,
  operations['getDsoInfo']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/dso`,
  requestConfig: publicRequestConfig,
});

const GetValidatorFaucetsByValidatorParamsSchema = z.object({
  validatorIds: z.array(z.string()).min(1),
});
export type GetValidatorFaucetsByValidatorParams = z.infer<typeof GetValidatorFaucetsByValidatorParamsSchema>;
export const GetValidatorFaucetsByValidator = createApiOperation<
  GetValidatorFaucetsByValidatorParams,
  operations['getValidatorFaucetsByValidator']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetValidatorFaucetsByValidatorParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const qs = new URLSearchParams();
    for (const id of params.validatorIds) {
      qs.append('validator_ids', id);
    }
    return `${apiUrl}/v0/validators/validator-faucets${toQueryString(qs)}`;
  },
  requestConfig: publicRequestConfig,
});

export const ListDsoScans = createApiOperation<
  void,
  operations['listDsoScans']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/scans`,
  requestConfig: publicRequestConfig,
});

const ListValidatorLicensesParamsSchema = z.object({
  after: z.string().optional(),
  limit: z.number().int().positive().optional(),
});
export type ListValidatorLicensesParams = z.infer<typeof ListValidatorLicensesParamsSchema>;
export const ListValidatorLicenses = createApiOperation<
  ListValidatorLicensesParams,
  operations['listValidatorLicenses']['responses']['200']['content']['application/json']
>({
  paramsSchema: ListValidatorLicensesParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const qs = new URLSearchParams();
    if (params.after) qs.set('after', params.after);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    return `${apiUrl}/v0/admin/validator/licenses${toQueryString(qs)}`;
  },
  requestConfig: publicRequestConfig,
});

export const ListDsoSequencers = createApiOperation<
  void,
  operations['listDsoSequencers']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/dso-sequencers`,
  requestConfig: publicRequestConfig,
});

export const ListSvBftSequencers = createApiOperation<
  void,
  operations['listSvBftSequencers']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/sv-bft-sequencers`,
  requestConfig: publicRequestConfig,
});

const GetPartyToParticipantParamsSchema = z.object({
  domainId: z.string(),
  partyId: z.string(),
});
export type GetPartyToParticipantParams = z.infer<typeof GetPartyToParticipantParamsSchema>;
export const GetPartyToParticipant = createApiOperation<
  GetPartyToParticipantParams,
  operations['getPartyToParticipant']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetPartyToParticipantParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) =>
    `${apiUrl}/v0/domains/${encodeURIComponent(params.domainId)}/parties/${encodeURIComponent(params.partyId)}/participant-id`,
  requestConfig: publicRequestConfig,
});

const GetMemberTrafficStatusParamsSchema = z.object({
  domainId: z.string(),
  memberId: z.string(),
});
export type GetMemberTrafficStatusParams = z.infer<typeof GetMemberTrafficStatusParamsSchema>;
export const GetMemberTrafficStatus = createApiOperation<
  GetMemberTrafficStatusParams,
  operations['getMemberTrafficStatus']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetMemberTrafficStatusParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) =>
    `${apiUrl}/v0/domains/${encodeURIComponent(params.domainId)}/members/${encodeURIComponent(params.memberId)}/traffic-status`,
  requestConfig: publicRequestConfig,
});

export const GetClosedRounds = createApiOperation<
  void,
  operations['getClosedRounds']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/closed-rounds`,
  requestConfig: publicRequestConfig,
});

type GetOpenAndIssuingMiningRoundsRequest =
  operations['getOpenAndIssuingMiningRounds']['requestBody']['content']['application/json'];
const GetOpenAndIssuingMiningRoundsParamsSchema = z.object({
  body: z.custom<GetOpenAndIssuingMiningRoundsRequest>(),
});
export type GetOpenAndIssuingMiningRoundsParams = z.infer<typeof GetOpenAndIssuingMiningRoundsParamsSchema>;
export const GetOpenAndIssuingMiningRounds = createApiOperation<
  GetOpenAndIssuingMiningRoundsParams,
  operations['getOpenAndIssuingMiningRounds']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetOpenAndIssuingMiningRoundsParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/open-and-issuing-mining-rounds`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

type UpdateHistoryRequestV2 = operations['getUpdateHistoryV2']['requestBody']['content']['application/json'];
const GetUpdateHistoryV2ParamsSchema = z.object({ body: z.custom<UpdateHistoryRequestV2>() });
export type GetUpdateHistoryV2Params = z.infer<typeof GetUpdateHistoryV2ParamsSchema>;
export const GetUpdateHistoryV2 = createApiOperation<
  GetUpdateHistoryV2Params,
  operations['getUpdateHistoryV2']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetUpdateHistoryV2ParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v2/updates`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

const GetUpdateByIdV2ParamsSchema = z.object({
  updateId: z.string(),
  damlValueEncoding: z.string().optional(),
});
export type GetUpdateByIdV2Params = z.infer<typeof GetUpdateByIdV2ParamsSchema>;
export const GetUpdateByIdV2 = createApiOperation<
  GetUpdateByIdV2Params,
  operations['getUpdateByIdV2']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetUpdateByIdV2ParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const qs = new URLSearchParams();
    if (params.damlValueEncoding) qs.set('daml_value_encoding', params.damlValueEncoding);
    return `${apiUrl}/v2/updates/${encodeURIComponent(params.updateId)}${toQueryString(qs)}`;
  },
  requestConfig: publicRequestConfig,
});

type UpdateHistoryRequestV1 = operations['getUpdateHistoryV1']['requestBody']['content']['application/json'];
const GetUpdateHistoryV1ParamsSchema = z.object({ body: z.custom<UpdateHistoryRequestV1>() });
export type GetUpdateHistoryV1Params = z.infer<typeof GetUpdateHistoryV1ParamsSchema>;
export const GetUpdateHistoryV1 = createApiOperation<
  GetUpdateHistoryV1Params,
  operations['getUpdateHistoryV1']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetUpdateHistoryV1ParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v1/updates`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

const GetUpdateByIdV1ParamsSchema = z.object({
  updateId: z.string(),
  damlValueEncoding: z.string().optional(),
});
export type GetUpdateByIdV1Params = z.infer<typeof GetUpdateByIdV1ParamsSchema>;
export const GetUpdateByIdV1 = createApiOperation<
  GetUpdateByIdV1Params,
  operations['getUpdateByIdV1']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetUpdateByIdV1ParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const qs = new URLSearchParams();
    if (params.damlValueEncoding) qs.set('daml_value_encoding', params.damlValueEncoding);
    return `${apiUrl}/v1/updates/${encodeURIComponent(params.updateId)}${toQueryString(qs)}`;
  },
  requestConfig: publicRequestConfig,
});

const GetDateOfMostRecentSnapshotBeforeParamsSchema = z.object({
  before: z.string(),
  migrationId: z.number().int(),
});
export type GetDateOfMostRecentSnapshotBeforeParams = z.infer<typeof GetDateOfMostRecentSnapshotBeforeParamsSchema>;
export const GetDateOfMostRecentSnapshotBefore = createApiOperation<
  GetDateOfMostRecentSnapshotBeforeParams,
  operations['getDateOfMostRecentSnapshotBefore']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetDateOfMostRecentSnapshotBeforeParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const qs = new URLSearchParams();
    qs.set('before', params.before);
    qs.set('migration_id', String(params.migrationId));
    return `${apiUrl}/v0/state/acs/snapshot-timestamp${toQueryString(qs)}`;
  },
  requestConfig: publicRequestConfig,
});

type GetAcsSnapshotAtRequest = operations['getAcsSnapshotAt']['requestBody']['content']['application/json'];
const GetAcsSnapshotAtParamsSchema = z.object({ body: z.custom<GetAcsSnapshotAtRequest>() });
export type GetAcsSnapshotAtParams = z.infer<typeof GetAcsSnapshotAtParamsSchema>;
export const GetAcsSnapshotAt = createApiOperation<
  GetAcsSnapshotAtParams,
  operations['getAcsSnapshotAt']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetAcsSnapshotAtParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/state/acs`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

export const ForceAcsSnapshotNow = createApiOperation<
  void,
  operations['forceAcsSnapshotNow']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/state/acs/force`,
  buildRequestData: () => ({}),
  requestConfig: publicRequestConfig,
});

type GetHoldingsStateAtRequest = operations['getHoldingsStateAt']['requestBody']['content']['application/json'];
const GetHoldingsStateAtParamsSchema = z.object({ body: z.custom<GetHoldingsStateAtRequest>() });
export type GetHoldingsStateAtParams = z.infer<typeof GetHoldingsStateAtParamsSchema>;
export const GetHoldingsStateAt = createApiOperation<
  GetHoldingsStateAtParams,
  operations['getHoldingsStateAt']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetHoldingsStateAtParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/holdings/state`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

type GetHoldingsSummaryAtRequest = operations['getHoldingsSummaryAt']['requestBody']['content']['application/json'];
const GetHoldingsSummaryAtParamsSchema = z.object({ body: z.custom<GetHoldingsSummaryAtRequest>() });
export type GetHoldingsSummaryAtParams = z.infer<typeof GetHoldingsSummaryAtParamsSchema>;
export const GetHoldingsSummaryAt = createApiOperation<
  GetHoldingsSummaryAtParams,
  operations['getHoldingsSummaryAt']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetHoldingsSummaryAtParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/holdings/summary`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

const ListAnsEntriesParamsSchema = z.object({
  namePrefix: z.string().optional(),
  pageSize: z.number().int().positive(),
});
export type ListAnsEntriesParams = z.infer<typeof ListAnsEntriesParamsSchema>;
export const ListAnsEntries = createApiOperation<
  ListAnsEntriesParams,
  operations['listAnsEntries']['responses']['200']['content']['application/json']
>({
  paramsSchema: ListAnsEntriesParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const qs = new URLSearchParams();
    if (params.namePrefix) qs.set('name_prefix', params.namePrefix);
    qs.set('page_size', String(params.pageSize));
    return `${apiUrl}/v0/ans-entries${toQueryString(qs)}`;
  },
  requestConfig: publicRequestConfig,
});

const LookupAnsEntryByPartyParamsSchema = z.object({ party: z.string() });
export type LookupAnsEntryByPartyParams = z.infer<typeof LookupAnsEntryByPartyParamsSchema>;
export const LookupAnsEntryByParty = createApiOperation<
  LookupAnsEntryByPartyParams,
  operations['lookupAnsEntryByParty']['responses']['200']['content']['application/json']
>({
  paramsSchema: LookupAnsEntryByPartyParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => `${apiUrl}/v0/ans-entries/by-party/${encodeURIComponent(params.party)}`,
  requestConfig: publicRequestConfig,
});

const LookupAnsEntryByNameParamsSchema = z.object({ name: z.string() });
export type LookupAnsEntryByNameParams = z.infer<typeof LookupAnsEntryByNameParamsSchema>;
export const LookupAnsEntryByName = createApiOperation<
  LookupAnsEntryByNameParams,
  operations['lookupAnsEntryByName']['responses']['200']['content']['application/json']
>({
  paramsSchema: LookupAnsEntryByNameParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => `${apiUrl}/v0/ans-entries/by-name/${encodeURIComponent(params.name)}`,
  requestConfig: publicRequestConfig,
});

export const GetDsoPartyId = createApiOperation<
  void,
  operations['getDsoPartyId']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/dso-party-id`,
  requestConfig: publicRequestConfig,
});

type GetAmuletRulesRequest = operations['getAmuletRules']['requestBody']['content']['application/json'];
const GetAmuletRulesParamsSchema = z.object({ body: z.custom<GetAmuletRulesRequest>() });
export type GetAmuletRulesParams = z.infer<typeof GetAmuletRulesParamsSchema>;
export const GetAmuletRules = createApiOperation<
  GetAmuletRulesParams,
  operations['getAmuletRules']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetAmuletRulesParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/amulet-rules`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

type GetExternalPartyAmuletRulesRequest =
  operations['getExternalPartyAmuletRules']['requestBody']['content']['application/json'];
const GetExternalPartyAmuletRulesParamsSchema = z.object({ body: z.custom<GetExternalPartyAmuletRulesRequest>() });
export type GetExternalPartyAmuletRulesParams = z.infer<typeof GetExternalPartyAmuletRulesParamsSchema>;
export const GetExternalPartyAmuletRules = createApiOperation<
  GetExternalPartyAmuletRulesParams,
  operations['getExternalPartyAmuletRules']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetExternalPartyAmuletRulesParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/external-party-amulet-rules`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

type GetAnsRulesRequest = operations['getAnsRules']['requestBody']['content']['application/json'];
const GetAnsRulesParamsSchema = z.object({ body: z.custom<GetAnsRulesRequest>() });
export type GetAnsRulesParams = z.infer<typeof GetAnsRulesParamsSchema>;
export const GetAnsRules = createApiOperation<
  GetAnsRulesParams,
  operations['getAnsRules']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetAnsRulesParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/ans-rules`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

export const ListFeaturedAppRights = createApiOperation<
  void,
  operations['listFeaturedAppRights']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/featured-apps`,
  requestConfig: publicRequestConfig,
});

const LookupFeaturedAppRightParamsSchema = z.object({ providerPartyId: z.string() });
export type LookupFeaturedAppRightParams = z.infer<typeof LookupFeaturedAppRightParamsSchema>;
export const LookupFeaturedAppRight = createApiOperation<
  LookupFeaturedAppRightParams,
  operations['lookupFeaturedAppRight']['responses']['200']['content']['application/json']
>({
  paramsSchema: LookupFeaturedAppRightParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => `${apiUrl}/v0/featured-apps/${encodeURIComponent(params.providerPartyId)}`,
  requestConfig: publicRequestConfig,
});

export const GetTopValidatorsByValidatorFaucets = createApiOperation<
  void,
  operations['getTopValidatorsByValidatorFaucets']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/top-validators-by-validator-faucets`,
  requestConfig: publicRequestConfig,
});

const LookupTransferPreapprovalByPartyParamsSchema = z.object({ party: z.string() });
export type LookupTransferPreapprovalByPartyParams = z.infer<typeof LookupTransferPreapprovalByPartyParamsSchema>;
export const LookupTransferPreapprovalByParty = createApiOperation<
  LookupTransferPreapprovalByPartyParams,
  operations['lookupTransferPreapprovalByParty']['responses']['200']['content']['application/json']
>({
  paramsSchema: LookupTransferPreapprovalByPartyParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => `${apiUrl}/v0/transfer-preapprovals/by-party/${encodeURIComponent(params.party)}`,
  requestConfig: publicRequestConfig,
});

const LookupTransferCommandCounterByPartyParamsSchema = z.object({ party: z.string() });
export type LookupTransferCommandCounterByPartyParams = z.infer<typeof LookupTransferCommandCounterByPartyParamsSchema>;
export const LookupTransferCommandCounterByParty = createApiOperation<
  LookupTransferCommandCounterByPartyParams,
  operations['lookupTransferCommandCounterByParty']['responses']['200']['content']['application/json']
>({
  paramsSchema: LookupTransferCommandCounterByPartyParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => `${apiUrl}/v0/transfer-command-counter/${encodeURIComponent(params.party)}`,
  requestConfig: publicRequestConfig,
});

const LookupTransferCommandStatusParamsSchema = z.object({
  sender: z.string(),
  nonce: z.number().int(),
});
export type LookupTransferCommandStatusParams = z.infer<typeof LookupTransferCommandStatusParamsSchema>;
export const LookupTransferCommandStatus = createApiOperation<
  LookupTransferCommandStatusParams,
  operations['lookupTransferCommandStatus']['responses']['200']['content']['application/json']
>({
  paramsSchema: LookupTransferCommandStatusParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const qs = new URLSearchParams();
    qs.set('sender', params.sender);
    qs.set('nonce', String(params.nonce));
    return `${apiUrl}/v0/transfer-command/status${toQueryString(qs)}`;
  },
  requestConfig: publicRequestConfig,
});

export const GetMigrationSchedule = createApiOperation<
  void,
  operations['getMigrationSchedule']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/migrations/schedule`,
  requestConfig: publicRequestConfig,
});

const GetSynchronizerIdentitiesParamsSchema = z.object({ domainIdPrefix: z.string() });
export type GetSynchronizerIdentitiesParams = z.infer<typeof GetSynchronizerIdentitiesParamsSchema>;
export const GetSynchronizerIdentities = createApiOperation<
  GetSynchronizerIdentitiesParams,
  operations['getSynchronizerIdentities']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetSynchronizerIdentitiesParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => `${apiUrl}/v0/synchronizer-identities/${encodeURIComponent(params.domainIdPrefix)}`,
  requestConfig: publicRequestConfig,
});

const GetSynchronizerBootstrappingTransactionsParamsSchema = z.object({ domainIdPrefix: z.string() });
export type GetSynchronizerBootstrappingTransactionsParams = z.infer<
  typeof GetSynchronizerBootstrappingTransactionsParamsSchema
>;
export const GetSynchronizerBootstrappingTransactions = createApiOperation<
  GetSynchronizerBootstrappingTransactionsParams,
  operations['getSynchronizerBootstrappingTransactions']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetSynchronizerBootstrappingTransactionsParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) =>
    `${apiUrl}/v0/synchronizer-bootstrapping-transactions/${encodeURIComponent(params.domainIdPrefix)}`,
  requestConfig: publicRequestConfig,
});

export const GetSpliceInstanceNames = createApiOperation<
  void,
  operations['getSpliceInstanceNames']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/splice-instance-names`,
  requestConfig: publicRequestConfig,
});

export const ListAmuletPriceVotes = createApiOperation<
  void,
  operations['listAmuletPriceVotes']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/amulet-price/votes`,
  requestConfig: publicRequestConfig,
});

type ListVoteRequestsByTrackingCidRequest =
  operations['listVoteRequestsByTrackingCid']['requestBody']['content']['application/json'];
const ListVoteRequestsByTrackingCidParamsSchema = z.object({ body: z.custom<ListVoteRequestsByTrackingCidRequest>() });
export type ListVoteRequestsByTrackingCidParams = z.infer<typeof ListVoteRequestsByTrackingCidParamsSchema>;
export const ListVoteRequestsByTrackingCid = createApiOperation<
  ListVoteRequestsByTrackingCidParams,
  operations['listVoteRequestsByTrackingCid']['responses']['200']['content']['application/json']
>({
  paramsSchema: ListVoteRequestsByTrackingCidParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/voterequest`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

const LookupDsoRulesVoteRequestParamsSchema = z.object({ voteRequestContractId: z.string() });
export type LookupDsoRulesVoteRequestParams = z.infer<typeof LookupDsoRulesVoteRequestParamsSchema>;
export const LookupDsoRulesVoteRequest = createApiOperation<
  LookupDsoRulesVoteRequestParams,
  operations['lookupDsoRulesVoteRequest']['responses']['200']['content']['application/json']
>({
  paramsSchema: LookupDsoRulesVoteRequestParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => `${apiUrl}/v0/voterequests/${encodeURIComponent(params.voteRequestContractId)}`,
  requestConfig: publicRequestConfig,
});

export const ListDsoRulesVoteRequests = createApiOperation<
  void,
  operations['listDsoRulesVoteRequests']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/admin/sv/voterequests`,
  requestConfig: publicRequestConfig,
});

type ListVoteRequestResultsRequest = operations['listVoteRequestResults']['requestBody']['content']['application/json'];
const ListVoteRequestResultsParamsSchema = z.object({ body: z.custom<ListVoteRequestResultsRequest>() });
export type ListVoteRequestResultsParams = z.infer<typeof ListVoteRequestResultsParamsSchema>;
export const ListVoteRequestResults = createApiOperation<
  ListVoteRequestResultsParams,
  operations['listVoteRequestResults']['responses']['200']['content']['application/json']
>({
  paramsSchema: ListVoteRequestResultsParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/admin/sv/voteresults`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

type GetMigrationInfoRequest = operations['getMigrationInfo']['requestBody']['content']['application/json'];
const GetMigrationInfoParamsSchema = z.object({ body: z.custom<GetMigrationInfoRequest>() });
export type GetMigrationInfoParams = z.infer<typeof GetMigrationInfoParamsSchema>;
export const GetMigrationInfo = createApiOperation<
  GetMigrationInfoParams,
  operations['getMigrationInfo']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetMigrationInfoParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/backfilling/migration-info`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

type GetUpdatesBeforeRequest = operations['getUpdatesBefore']['requestBody']['content']['application/json'];
const GetUpdatesBeforeParamsSchema = z.object({ body: z.custom<GetUpdatesBeforeRequest>() });
export type GetUpdatesBeforeParams = z.infer<typeof GetUpdatesBeforeParamsSchema>;
export const GetUpdatesBefore = createApiOperation<
  GetUpdatesBeforeParams,
  operations['getUpdatesBefore']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetUpdatesBeforeParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/backfilling/updates-before`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

export const GetBackfillingStatus = createApiOperation<
  void,
  operations['getBackfillingStatus']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/backfilling/status`,
  requestConfig: publicRequestConfig,
});

const GetAcsSnapshotParamsSchema = z.object({
  party: z.string(),
  recordTime: z.string().optional(),
});
export type GetAcsSnapshotParams = z.infer<typeof GetAcsSnapshotParamsSchema>;
export const GetAcsSnapshot = createApiOperation<
  GetAcsSnapshotParams,
  operations['getAcsSnapshot']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetAcsSnapshotParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const qs = new URLSearchParams();
    if (params.recordTime) qs.set('record_time', params.recordTime);
    return `${apiUrl}/v0/acs/${encodeURIComponent(params.party)}${toQueryString(qs)}`;
  },
  requestConfig: publicRequestConfig,
});

export const GetAggregatedRounds = createApiOperation<
  void,
  operations['getAggregatedRounds']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/aggregated-rounds`,
  requestConfig: publicRequestConfig,
});

type ListRoundTotalsRequest = operations['listRoundTotals']['requestBody']['content']['application/json'];
const ListRoundTotalsParamsSchema = z.object({ body: z.custom<ListRoundTotalsRequest>() });
export type ListRoundTotalsParams = z.infer<typeof ListRoundTotalsParamsSchema>;
export const ListRoundTotals = createApiOperation<
  ListRoundTotalsParams,
  operations['listRoundTotals']['responses']['200']['content']['application/json']
>({
  paramsSchema: ListRoundTotalsParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/round-totals`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

type ListRoundPartyTotalsRequest = operations['listRoundPartyTotals']['requestBody']['content']['application/json'];
const ListRoundPartyTotalsParamsSchema = z.object({ body: z.custom<ListRoundPartyTotalsRequest>() });
export type ListRoundPartyTotalsParams = z.infer<typeof ListRoundPartyTotalsParamsSchema>;
export const ListRoundPartyTotals = createApiOperation<
  ListRoundPartyTotalsParams,
  operations['listRoundPartyTotals']['responses']['200']['content']['application/json']
>({
  paramsSchema: ListRoundPartyTotalsParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/round-party-totals`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

export const GetTotalAmuletBalance = createApiOperation<
  void,
  operations['getTotalAmuletBalance']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/total-amulet-balance`,
  requestConfig: publicRequestConfig,
});

export const GetWalletBalance = createApiOperation<
  void,
  operations['getWalletBalance']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/wallet-balance`,
  requestConfig: publicRequestConfig,
});

export const GetAmuletConfigForRound = createApiOperation<
  void,
  operations['getAmuletConfigForRound']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/amulet-config-for-round`,
  requestConfig: publicRequestConfig,
});

export const GetRoundOfLatestData = createApiOperation<
  void,
  operations['getRoundOfLatestData']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/round-of-latest-data`,
  requestConfig: publicRequestConfig,
});

export const GetRewardsCollected = createApiOperation<
  void,
  operations['getRewardsCollected']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/rewards-collected`,
  requestConfig: publicRequestConfig,
});

export const GetTopProvidersByAppRewards = createApiOperation<
  void,
  operations['getTopProvidersByAppRewards']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/top-providers-by-app-rewards`,
  requestConfig: publicRequestConfig,
});

export const GetTopValidatorsByValidatorRewards = createApiOperation<
  void,
  operations['getTopValidatorsByValidatorRewards']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/top-validators-by-validator-rewards`,
  requestConfig: publicRequestConfig,
});

export const GetTopValidatorsByPurchasedTraffic = createApiOperation<
  void,
  operations['getTopValidatorsByPurchasedTraffic']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/top-validators-by-purchased-traffic`,
  requestConfig: publicRequestConfig,
});

type ListActivityRequest = operations['listActivity']['requestBody']['content']['application/json'];
const ListActivityParamsSchema = z.object({ body: z.custom<ListActivityRequest>() });
export type ListActivityParams = z.infer<typeof ListActivityParamsSchema>;
export const ListActivity = createApiOperation<
  ListActivityParams,
  operations['listActivity']['responses']['200']['content']['application/json']
>({
  paramsSchema: ListActivityParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/activities`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

type ListTransactionHistoryRequest = operations['listTransactionHistory']['requestBody']['content']['application/json'];
const ListTransactionHistoryParamsSchema = z.object({ body: z.custom<ListTransactionHistoryRequest>() });
export type ListTransactionHistoryParams = z.infer<typeof ListTransactionHistoryParamsSchema>;
export const ListTransactionHistory = createApiOperation<
  ListTransactionHistoryParams,
  operations['listTransactionHistory']['responses']['200']['content']['application/json']
>({
  paramsSchema: ListTransactionHistoryParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/transactions`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

type GetUpdateHistoryRequest = operations['getUpdateHistory']['requestBody']['content']['application/json'];
const GetUpdateHistoryParamsSchema = z.object({ body: z.custom<GetUpdateHistoryRequest>() });
export type GetUpdateHistoryParams = z.infer<typeof GetUpdateHistoryParamsSchema>;
export const GetUpdateHistory = createApiOperation<
  GetUpdateHistoryParams,
  operations['getUpdateHistory']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetUpdateHistoryParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/updates`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

const GetUpdateByIdParamsSchema = z.object({ updateId: z.string(), lossless: z.boolean().optional() });
export type GetUpdateByIdParams = z.infer<typeof GetUpdateByIdParamsSchema>;
export const GetUpdateById = createApiOperation<
  GetUpdateByIdParams,
  operations['getUpdateById']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetUpdateByIdParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const qs = new URLSearchParams();
    if (params.lossless !== undefined) qs.set('lossless', params.lossless ? 'true' : 'false');
    return `${apiUrl}/v0/updates/${encodeURIComponent(params.updateId)}${toQueryString(qs)}`;
  },
  requestConfig: publicRequestConfig,
});

export const FeatureSupport = createApiOperation<
  void,
  operations['featureSupport']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/feature-support`,
  requestConfig: publicRequestConfig,
});

type GetImportUpdatesRequest = operations['getImportUpdates']['requestBody']['content']['application/json'];
const GetImportUpdatesParamsSchema = z.object({ body: z.custom<GetImportUpdatesRequest>() });
export type GetImportUpdatesParams = z.infer<typeof GetImportUpdatesParamsSchema>;
export const GetImportUpdates = createApiOperation<
  GetImportUpdatesParams,
  operations['getImportUpdates']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetImportUpdatesParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/backfilling/import-updates`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

type GetEventHistoryRequest = operations['getEventHistory']['requestBody']['content']['application/json'];
const GetEventHistoryParamsSchema = z.object({ body: z.custom<GetEventHistoryRequest>() });
export type GetEventHistoryParams = z.infer<typeof GetEventHistoryParamsSchema>;
export const GetEventHistory = createApiOperation<
  GetEventHistoryParams,
  operations['getEventHistory']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetEventHistoryParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v0/events`,
  buildRequestData: (params) => params.body,
  requestConfig: publicRequestConfig,
});

const GetEventByIdParamsSchema = z.object({ updateId: z.string(), damlValueEncoding: z.string().optional() });
export type GetEventByIdParams = z.infer<typeof GetEventByIdParamsSchema>;
export const GetEventById = createApiOperation<
  GetEventByIdParams,
  operations['getEventById']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetEventByIdParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const qs = new URLSearchParams();
    if (params.damlValueEncoding) qs.set('daml_value_encoding', params.damlValueEncoding);
    return `${apiUrl}/v0/events/${encodeURIComponent(params.updateId)}${toQueryString(qs)}`;
  },
  requestConfig: publicRequestConfig,
});
