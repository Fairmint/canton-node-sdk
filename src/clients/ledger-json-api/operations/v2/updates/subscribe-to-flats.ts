import { z } from 'zod';
import { createWebSocketOperation } from '../../../../../core/operations/WebSocketOperationFactory';
import { GetUpdatesParamsSchema } from '../../../schemas/operations/updates';
import { JsCantonErrorSchema, WsCantonErrorSchema } from '../../../schemas/api/errors';
import { JsUpdateSchema, WsUpdateSchema } from '../../../schemas/api/updates';
import { normalizeUpdateFormat, buildWsRequestFilterAndVerbose } from './utils/format-normalizers';
import { WebSocketErrorUtils } from '../../../../../core/ws/WebSocketErrorUtils';

const path = '/v2/updates/flats' as const;

const UpdatesFlatsParamsSchema = GetUpdatesParamsSchema;

export type UpdatesFlatsWsParams = z.infer<typeof UpdatesFlatsParamsSchema>;
export type UpdatesFlatsWsMessage = { update: z.infer<typeof JsUpdateSchema> } | { update: z.infer<typeof WsUpdateSchema> } | z.infer<typeof JsCantonErrorSchema> | z.infer<typeof WsCantonErrorSchema>;

export const SubscribeToFlats = createWebSocketOperation<UpdatesFlatsWsParams, unknown, UpdatesFlatsWsMessage>({
	paramsSchema: UpdatesFlatsParamsSchema,
	buildPath: (_params, _apiUrl) => `${path}`,
	buildRequestMessage: (params) => {
		const hasUpdateFormat = Boolean(params.updateFormat);
		const { filter, verbose } = buildWsRequestFilterAndVerbose(params.updateFormat);
		return {
			beginExclusive: params.beginExclusive,
			endInclusive: params.endInclusive,
			// Server requires verbose; include it always. Only include filter when updateFormat is absent.
			verbose,
			...(hasUpdateFormat ? { updateFormat: normalizeUpdateFormat(params.updateFormat) } : { filter }),
		};
	},
	transformInbound: (msg) => WebSocketErrorUtils.parseUnion(
			msg,
			z.union([
				z.object({ update: JsUpdateSchema }),
				z.object({ update: WsUpdateSchema }),
				JsCantonErrorSchema,
				WsCantonErrorSchema,
			]),
			'SubscribeToFlats'
		),
}); 