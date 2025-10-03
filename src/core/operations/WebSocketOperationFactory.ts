import { z } from 'zod';
import { type BaseClient } from '../BaseClient';
import { ValidationError } from '../errors';
import { WebSocketClient, type WebSocketHandlers, type WebSocketSubscription } from '../ws';

export interface WebSocketOperationConfig<Params, RequestMessage, InboundMessage> {
  paramsSchema: z.ZodSchema<Params>;
  buildPath: (params: Params, apiUrl: string, client: BaseClient) => string;
  buildRequestMessage: (params: Params, client: BaseClient) => RequestMessage | Promise<RequestMessage>;
  transformInbound?: (msg: InboundMessage) => InboundMessage;
}

export function createWebSocketOperation<Params, RequestMessage, InboundMessage>(
  config: WebSocketOperationConfig<Params, RequestMessage, InboundMessage>
): new (client: BaseClient) => {
  client: BaseClient;
  subscribe: (params: Params, handlers: WebSocketHandlers<InboundMessage>) => Promise<WebSocketSubscription>;
} {
  return class WebSocketOperation {
    constructor(public client: BaseClient) {}

    public validateParams<T>(params: T, schema: z.ZodSchema<T>): T {
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

      const wrappedHandlers: WebSocketHandlers<InboundMessage> = config.transformInbound
        ? {
            ...handlers,
            onMessage: (msg) => {
              if (config.transformInbound) {
                handlers.onMessage(config.transformInbound(msg));
              } else {
                handlers.onMessage(msg);
              }
            },
          }
        : handlers;

      return wsClient.connect<RequestMessage, InboundMessage>(path, request, wrappedHandlers);
    }
  };
}
