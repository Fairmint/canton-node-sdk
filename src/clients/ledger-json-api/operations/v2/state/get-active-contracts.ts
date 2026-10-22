import { WebSocketClient } from '../../../../../core/ws/WebSocketClient';
import type { LedgerJsonApiClient } from '../../../LedgerJsonApiClient.generated';
import { type JsGetActiveContractsResponse, type JsGetActiveContractsResponseItem } from '../../../schemas/api/state';
import {
  ACTIVE_CONTRACTS_PATH,
  buildActiveContractsRequest,
  decodeActiveContractsFrame,
  type ActiveContractsParams,
  type ActiveContractsRequestMessage,
} from './active-contracts-request';

/**
 * We intentionally do not expose the JSON/REST version of this endpoint. The REST variant is too limited, while the
 * WebSocket variant returns the same snapshot and automatically closes the connection once the current state is sent.
 * Wrapping the WebSocket call behind a simple awaitable method gives a better DX and keeps the door open for optional
 * streaming via a callback. To read a snapshot without holding it in memory, use `streamActiveContracts`.
 */

export type GetActiveContractsParams = ActiveContractsParams & {
  /** Optional per-item callback to consume results as they arrive. */
  onItem?: (item: JsGetActiveContractsResponseItem) => void | Promise<void>;
};

export class GetActiveContracts {
  constructor(private readonly client: LedgerJsonApiClient) {}

  public async execute(params: GetActiveContractsParams): Promise<JsGetActiveContractsResponse> {
    const { requestMessage, idleTimeoutMs } = await buildActiveContractsRequest(this.client, params);

    const wsClient = new WebSocketClient(this.client);

    return new Promise<JsGetActiveContractsResponse>((resolve, reject) => {
      const results: JsGetActiveContractsResponse = [];
      let settled = false;

      void wsClient
        .connect<ActiveContractsRequestMessage, unknown>(
          ACTIVE_CONTRACTS_PATH,
          requestMessage,
          {
            onMessage: async (parsed): Promise<void> => {
              const frame = decodeActiveContractsFrame(parsed);

              if ('item' in frame) {
                results.push(frame.item);
                if (typeof params.onItem === 'function') {
                  await params.onItem(frame.item);
                }
              } else if (!settled) {
                settled = true;
                reject(frame.error);
                throw frame.error;
              }
            },
            onError: (err) => {
              if (!settled) {
                settled = true;
                reject(err instanceof Error ? err : new Error(String(err)));
              }
            },
            onClose: () => {
              if (!settled) {
                settled = true;
                resolve(results);
              }
            },
          },
          { idleTimeoutMs }
        )
        .catch((err: unknown) => {
          if (!settled) {
            settled = true;
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
    });
  }
}
