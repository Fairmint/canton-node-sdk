import { z } from 'zod';
import { createWebSocketOperation } from '../../../../../core/operations/WebSocketOperationFactory';
import { CompletionStreamRequestSchema, CompletionStreamResponseSchema, CompletionStreamRequest, CompletionStreamResponse } from '../../../schemas/api/completions';
import { JsCantonErrorSchema } from '../../../schemas/api/errors';

const path = '/v2/commands/completions' as const;

export type CompletionsWsParams = z.infer<typeof CompletionStreamRequestSchema>;
export type CompletionsWsMessage = CompletionStreamResponse | z.infer<typeof JsCantonErrorSchema>;

export const SubscribeToCompletions = createWebSocketOperation<CompletionsWsParams, CompletionStreamRequest, CompletionsWsMessage>({
	paramsSchema: CompletionStreamRequestSchema,
	buildPath: (_params, _apiUrl) => `${path}`,
	buildRequestMessage: (params, client) => {
		const userId = params.userId || client.getUserId();
		return {
			userId,
			parties: params.parties && params.parties.length > 0 ? params.parties : client.buildPartyList(),
			beginExclusive: params.beginExclusive,
		};
	},
	transformInbound: (msg) => {
		try {
			return CompletionStreamResponseSchema.parse(msg) as CompletionsWsMessage;
		} catch {
			return JsCantonErrorSchema.parse(msg) as CompletionsWsMessage;
		}
	},
}); 