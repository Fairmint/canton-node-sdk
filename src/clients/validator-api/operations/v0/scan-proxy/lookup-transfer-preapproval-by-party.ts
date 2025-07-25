import { createApiOperation } from '../../../../../core';
import { operations as scanProxyOperations } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';
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
  scanProxyOperations['lookupTransferPreapprovalByParty']['responses']['200']['content']['application/json']
>({
  paramsSchema: GetTransferPreapprovalsByPartyParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/transfer-preapprovals/by-party/${params.partyId}`,
}); 