import { z } from 'zod';
import { createWebSocketOperation } from '../../../../../core/operations/WebSocketOperationFactory';
import { GetUpdatesParamsSchema } from '../../../schemas/operations/updates';
import { JsCantonErrorSchema } from '../../../schemas/api/errors';
import { JsUpdateSchema } from '../../../schemas/api/updates';

const path = '/v2/updates/flats' as const;

const UpdatesFlatsParamsSchema = GetUpdatesParamsSchema;

export type UpdatesFlatsWsParams = z.infer<typeof UpdatesFlatsParamsSchema>;
export type UpdatesFlatsWsMessage = { update: z.infer<typeof JsUpdateSchema> } | z.infer<typeof JsCantonErrorSchema>;

export const SubscribeToFlats = createWebSocketOperation<UpdatesFlatsWsParams, unknown, UpdatesFlatsWsMessage>({
	paramsSchema: UpdatesFlatsParamsSchema,
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
			return z.object({ update: JsUpdateSchema }).parse(msg) as UpdatesFlatsWsMessage;
		} catch {
			return JsCantonErrorSchema.parse(msg) as UpdatesFlatsWsMessage;
		}
	},
}); 