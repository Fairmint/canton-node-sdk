import { z } from 'zod';
import { createSimpleApiOperation } from '../../../../src/core';
import type { GetTransferAgentResponse } from '../types';

// Define the parameters schema
export const GetTransferAgentParamsSchema = z.object({
  partyId: z.string(),
});

export type GetTransferAgentParams = z.infer<typeof GetTransferAgentParamsSchema>;

/**
 * Get transfer agent information from Lighthouse
 *
 * @example
 *   ```typescript
 *   const transferAgent = await client.getTransferAgent({ partyId: 'TransferAgent-mainnet-1::12204a039322c01e9f714b56259c3e68b69058bf5dfe1debbe956c698f905ceba9d7' });
 *   ```;
 */
export const GetTransferAgent = createSimpleApiOperation<GetTransferAgentParams, GetTransferAgentResponse>({
  paramsSchema: GetTransferAgentParamsSchema,
  method: 'GET',
  buildUrl: (params: GetTransferAgentParams, apiUrl: string) => {
    const url = `${apiUrl}/validators/${encodeURIComponent(params.partyId)}`;
    return url;
  },
});
