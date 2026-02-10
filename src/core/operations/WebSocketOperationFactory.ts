import { z } from 'zod';
import { type BaseClient } from '../BaseClient';
import { ValidationError } from '../errors';
import { WebSocketClient, type WebSocketHandlers, type WebSocketSubscription } from '../ws';

/** Configuration for a factory-created WebSocket operation. */
export interface WebSocketOperationConfig<Params, RequestMessage, InboundMessage> {
  /** Zod schema used to validate params. */
  readonly paramsSchema: z.ZodSchema<Params>;
  /** Builds the WebSocket path (appended to the base URL). */
  readonly buildPath: (params: Params, apiUrl: string, client: BaseClient) => string;
  /** Builds the initial request message sent after the WebSocket opens. */
  readonly buildRequestMessage: (params: Params, client: BaseClient) => RequestMessage | Promise<RequestMessage>;
  /** Optional transform applied to every inbound message before calling `onMessage`. */
  readonly transformInbound?: (msg: InboundMessage) => InboundMessage;
}

/**
 * Creates a WebSocket operation class from a declarative config.
 *
 * The returned class exposes a `subscribe()` method that opens a WebSocket, sends the initial request message, and
 * dispatches parsed messages to the provided handlers.
 *
 * @example
 *   export const SubscribeToCompletions = createWebSocketOperation<Params, Req, Msg>({
 *     paramsSchema: CompletionStreamRequestSchema,
 *     buildPath: () => '/v2/commands/completions',
 *     buildRequestMessage: (params, client) => ({ userId: params.userId ?? client.getUserId() }),
 *   });
 */
export function createWebSocketOperation<Params, RequestMessage, InboundMessage>(
  config: WebSocketOperationConfig<Params, RequestMessage, InboundMessage>
): new (client: BaseClient) => {
  readonly client: BaseClient;
  subscribe: (params: Params, handlers: WebSocketHandlers<InboundMessage>) => Promise<WebSocketSubscription>;
} {
  return class WebSocketOperation {
    constructor(public readonly client: BaseClient) {}

    private validateParams<T>(params: T, schema: z.ZodSchema<T>): T {
      try {
        return schema.parse(params);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError(
            `Parameter validation failed: ${error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
          );
        }
        throw error;
      }
    }

    public async subscribe(
      params: Params,
      handlers: WebSocketHandlers<InboundMessage>
    ): Promise<WebSocketSubscription> {
      const validatedParams = this.validateParams(params, config.paramsSchema);
      const wsClient = new WebSocketClient(this.client);
      const path = config.buildPath(validatedParams, this.client.getApiUrl(), this.client);
      const request = await config.buildRequestMessage(validatedParams, this.client);

      const { transformInbound } = config;
      const wrappedHandlers: WebSocketHandlers<InboundMessage> = transformInbound
        ? {
            ...handlers,
            onMessage: (msg) => {
              handlers.onMessage(transformInbound(msg));
            },
          }
        : handlers;

      return wsClient.connect<RequestMessage, InboundMessage>(path, request, wrappedHandlers);
    }
  };
}
