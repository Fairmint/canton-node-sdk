import { z } from 'zod';
import { ApiError } from '../../../../../core/errors';
import { WebSocketClient } from '../../../../../core/ws/WebSocketClient';
import type { LedgerJsonApiClient } from '../../../LedgerJsonApiClient.generated';
import { type JsCantonError, type WsCantonError } from '../../../schemas/api/errors';
import { type JsGetActiveContractsResponse, type JsGetActiveContractsResponseItem } from '../../../schemas/api/state';
import { buildEventFormat } from '../utils/event-format-builder';

const path = '/v2/state/active-contracts' as const;

/**
 * We intentionally do not expose the JSON/REST version of this endpoint. The REST variant is too limited, while the
 * WebSocket variant returns the same snapshot and automatically closes the connection once the current state is sent.
 * Wrapping the WebSocket call behind a simple awaitable method gives a better DX and keeps the door open for optional
 * streaming via a callback.
 */

const ActiveContractsParamsSchema = z.object({
  /** Optional list of parties to scope the filter. */
  parties: z.array(z.string()).optional(),
  /** Optional template filters applied server-side. */
  templateIds: z.array(z.string()).optional(),
  /** Include created event blob in TemplateFilter results (default false). */
  includeCreatedEventBlob: z.boolean().optional(),
  /** Allow caller to omit activeAtOffset; we'll default to ledger end */
  activeAtOffset: z.number().optional(),
});

export type GetActiveContractsParams = z.infer<typeof ActiveContractsParamsSchema> & {
  /** Optional per-item callback to consume results as they arrive. */
  onItem?: (item: JsGetActiveContractsResponseItem) => void;
};

export class GetActiveContracts {
  constructor(private readonly client: LedgerJsonApiClient) {}

  public async execute(params: GetActiveContractsParams): Promise<JsGetActiveContractsResponse> {
    const validated = ActiveContractsParamsSchema.parse(params);

    // Determine activeAtOffset (default to ledger end if not specified)
    let activeAtOffset: number;
    if (validated.activeAtOffset !== undefined) {
      ({ activeAtOffset } = validated);
    } else {
      const ledgerEnd = await this.client.getLedgerEnd({});
      ({ offset: activeAtOffset } = ledgerEnd);
    }

    // Build party list - default to client's party list if not provided
    const partyList =
      validated.parties && validated.parties.length > 0 ? validated.parties : this.client.buildPartyList();

    // Build event format
    const eventFormat = buildEventFormat({
      parties: partyList,
      ...(validated.templateIds !== undefined && { templateIds: validated.templateIds }),
      ...(validated.includeCreatedEventBlob !== undefined && {
        includeCreatedEventBlob: validated.includeCreatedEventBlob,
      }),
    });

    // Request message type for the active contracts WebSocket endpoint
    interface ActiveContractsRequestMessage {
      filter?: undefined;
      verbose: boolean;
      activeAtOffset: number;
      eventFormat: ReturnType<typeof buildEventFormat>;
    }

    // Response message can be a contract item or an error
    type ActiveContractsResponseMessage = JsGetActiveContractsResponseItem | JsCantonError | WsCantonError;

    const requestMessage: ActiveContractsRequestMessage = {
      filter: undefined,
      verbose: false,
      activeAtOffset,
      eventFormat,
    };

    const wsClient = new WebSocketClient(this.client);

    return new Promise<JsGetActiveContractsResponse>((resolve, reject) => {
      const results: JsGetActiveContractsResponse = [];
      let settled = false;

      /** Convert a Canton error response to a proper Error object */
      const toError = (errorResponse: JsCantonError | WsCantonError): Error => {
        // JsCantonError has 'message' string, WsCantonError has 'cause' string
        // JsCantonError has code as object, WsCantonError has code as string
        if ('cause' in errorResponse) {
          // WsCantonError
          return new ApiError(`WebSocket error [${errorResponse.code}]: ${errorResponse.cause}`);
        }
        // JsCantonError
        const codeStr = JSON.stringify(errorResponse.code);
        return new ApiError(`WebSocket error [${codeStr}]: ${errorResponse.message}`);
      };

      void wsClient
        .connect<ActiveContractsRequestMessage, ActiveContractsResponseMessage>(path, requestMessage, {
          onMessage: (parsed) => {
            // Distinguish item vs error union members
            if (typeof parsed === 'object' && 'contractEntry' in parsed) {
              results.push(parsed);
              if (typeof params.onItem === 'function') {
                params.onItem(parsed);
              }
            } else if (!settled) {
              // Treat any non-item as an error message
              settled = true;
              reject(toError(parsed));
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
        })
        .catch((err: unknown) => {
          if (!settled) {
            settled = true;
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        });
    });
  }
}
