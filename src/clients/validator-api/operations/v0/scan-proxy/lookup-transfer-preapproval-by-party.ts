import { createApiOperation } from '../../../../../core';
import { LookupTransferPreapprovalByPartyResponse } from '../../../schemas/api';
import { GetTransferPreapprovalsByPartyParamsSchema, GetTransferPreapprovalsByPartyParams } from '../../../schemas/operations';

/**
 * @description Lookup transfer preapproval by party
 * @example
 * ```typescript
 * const preapproval = await client.lookupTransferPreapprovalByParty({ partyId: 'party123' });
 * console.log(`Preapproval: ${preapproval.transfer_preapproval.contract.contract_id}`);
 * ```
 */
export const LookupTransferPreapprovalByParty = createApiOperation<
  GetTransferPreapprovalsByPartyParams,
  LookupTransferPreapprovalByPartyResponse
>({
  paramsSchema: GetTransferPreapprovalsByPartyParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/transfer-preapprovals/by-party/${params.partyId}`,
}); 