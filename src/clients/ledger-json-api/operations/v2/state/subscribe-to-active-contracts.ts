import { z } from 'zod';
import { createWebSocketOperation } from '../../../../../core/operations/WebSocketOperationFactory';
import { WebSocketErrorUtils } from '../../../../../core/ws/WebSocketErrorUtils';
import { JsCantonErrorSchema } from '../../../schemas/api/errors';
import { GetActiveContractsRequestSchema, JsGetActiveContractsResponseItemSchema } from '../../../schemas/api/state';

const path = '/v2/state/active-contracts' as const;

const ActiveContractsParamsSchema = GetActiveContractsRequestSchema.extend({
  parties: z.array(z.string()).optional(),
});

export type ActiveContractsWsParams = z.infer<typeof ActiveContractsParamsSchema>;
export type ActiveContractsWsMessage =
  | z.infer<typeof JsGetActiveContractsResponseItemSchema>
  | z.infer<typeof JsCantonErrorSchema>;

export const SubscribeToActiveContracts = createWebSocketOperation<
  ActiveContractsWsParams,
  z.infer<typeof GetActiveContractsRequestSchema>,
  ActiveContractsWsMessage
>({
  paramsSchema: ActiveContractsParamsSchema,
  buildPath: (_params, _apiUrl) => `${path}`,
  buildRequestMessage: (params, client) => ({
    filter: undefined,
    verbose: params.eventFormat ? undefined : (params.verbose ?? false),
    activeAtOffset: params.activeAtOffset,
    eventFormat: params.eventFormat ?? {
      filtersByParty: Object.fromEntries(
        (params.parties && params.parties.length > 0 ? params.parties : client.buildPartyList()).map((p) => [
          p,
          { cumulative: [] },
        ])
      ),
      verbose: params.verbose ?? false,
    },
  }),
  transformInbound: (msg) =>
    WebSocketErrorUtils.parseUnion(
      msg,
      z.union([JsGetActiveContractsResponseItemSchema, JsCantonErrorSchema]),
      'SubscribeToActiveContracts'
    ),
});
