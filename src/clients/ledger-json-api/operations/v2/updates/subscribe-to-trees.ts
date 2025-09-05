import { z } from 'zod';
import { createWebSocketOperation } from '../../../../../core/operations/WebSocketOperationFactory';
import { GetUpdatesParamsSchema } from '../../../schemas/operations/updates';
import { JsCantonErrorSchema, WsCantonErrorSchema } from '../../../schemas/api/errors';
import { JsTransactionTreeSchema, WsUpdateTreesSchema } from '../../../schemas/api/updates';
import { buildWsRequestFilterAndVerbose } from './utils/format-normalizers';

const path = '/v2/updates/trees' as const;

const UpdatesTreesParamsSchema = GetUpdatesParamsSchema;

export type UpdatesTreesWsParams = z.infer<typeof UpdatesTreesParamsSchema>;
export type UpdatesTreesWsMessage = { update: { JsTransactionTree: z.infer<typeof JsTransactionTreeSchema> } } | { update: z.infer<typeof WsUpdateTreesSchema> } | z.infer<typeof JsCantonErrorSchema> | z.infer<typeof WsCantonErrorSchema>;

export const SubscribeToTrees = createWebSocketOperation<UpdatesTreesWsParams, unknown, UpdatesTreesWsMessage>({
	paramsSchema: UpdatesTreesParamsSchema,
	buildPath: (_params, _apiUrl) => `${path}`,
	buildRequestMessage: (params) => {
		const { filter, verbose } = buildWsRequestFilterAndVerbose(params.updateFormat);
		return {
			beginExclusive: params.beginExclusive,
			endInclusive: params.endInclusive,
			verbose,
			filter,
		};
	},
	transformInbound: (msg) => {
		return z.union([
			z.object({ update: z.object({ JsTransactionTree: JsTransactionTreeSchema }) }),
			z.object({ update: WsUpdateTreesSchema }),
			JsCantonErrorSchema,
			WsCantonErrorSchema,
		]).parse(msg) as UpdatesTreesWsMessage;
	},
}); 