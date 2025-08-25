import { z } from 'zod';
import { createWebSocketOperation } from '../../../../../core/operations/WebSocketOperationFactory';
import { GetUpdatesParamsSchema } from '../../../schemas/operations/updates';
import { JsCantonErrorSchema } from '../../../schemas/api/errors';
import { JsTransactionTreeSchema } from '../../../schemas/api/updates';

const path = '/v2/updates/trees' as const;

const UpdatesTreesParamsSchema = GetUpdatesParamsSchema;

export type UpdatesTreesWsParams = z.infer<typeof UpdatesTreesParamsSchema>;
export type UpdatesTreesWsMessage = { update: { JsTransactionTree: z.infer<typeof JsTransactionTreeSchema> } } | z.infer<typeof JsCantonErrorSchema>;

export const SubscribeToTrees = createWebSocketOperation<UpdatesTreesWsParams, unknown, UpdatesTreesWsMessage>({
	paramsSchema: UpdatesTreesParamsSchema,
	buildPath: (_params, _apiUrl) => `${path}`,
	buildRequestMessage: (params) => {
		return {
			beginExclusive: params.beginExclusive,
			endInclusive: params.endInclusive,
			updateFormat: params.updateFormat,
		};
	},
	transformInbound: (msg) => {
		try {
			return z.object({ update: z.object({ JsTransactionTree: JsTransactionTreeSchema }) }).parse(msg) as UpdatesTreesWsMessage;
		} catch {
			return JsCantonErrorSchema.parse(msg) as UpdatesTreesWsMessage;
		}
	},
}); 