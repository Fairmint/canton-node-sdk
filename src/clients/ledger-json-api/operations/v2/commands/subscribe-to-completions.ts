import { z } from 'zod';
import { createWebSocketOperation } from '../../../../../core/operations/WebSocketOperationFactory';
import { CompletionStreamRequestSchema, CompletionStreamResponseSchema, CompletionStreamRequest, CompletionStreamResponse } from '../../../schemas/api/completions';
import { JsCantonErrorSchema, WsCantonErrorSchema } from '../../../schemas/api/errors';

const path = '/v2/commands/completions' as const;

export type CompletionsWsParams = z.infer<typeof CompletionStreamRequestSchema>;
export type CompletionsWsMessage = CompletionStreamResponse | z.infer<typeof JsCantonErrorSchema> | z.infer<typeof WsCantonErrorSchema>;

export const SubscribeToCompletions = createWebSocketOperation<CompletionsWsParams, CompletionStreamRequest, CompletionsWsMessage>({
	paramsSchema: CompletionStreamRequestSchema,
	buildPath: (_params, _apiUrl) => `${path}`,
	buildRequestMessage: async (params, client) => {
		const userId = params.userId || client.getUserId();
		if (!userId) {
			throw new Error('subscribeToCompletions requires a userId. Provide it in params or configure client userId.');
		}
		return {
			userId,
			parties: params.parties && params.parties.length > 0 ? params.parties : client.buildPartyList(),
			beginExclusive: params.beginExclusive,
		};
	},
	transformInbound: (msg) => {
		return z.union([
			CompletionStreamResponseSchema,
			JsCantonErrorSchema,
			WsCantonErrorSchema,
		]).parse(msg) as CompletionsWsMessage;
	},
}); 