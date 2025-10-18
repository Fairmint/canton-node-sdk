import { z } from 'zod';
import { type BaseClient } from '../../../../../core/BaseClient';
import { WebSocketClient } from '../../../../../core/ws/WebSocketClient';
import { WebSocketErrorUtils } from '../../../../../core/ws/WebSocketErrorUtils';
import type { LedgerJsonApiClient } from '../../../LedgerJsonApiClient.generated';
import { JsCantonErrorSchema, WsCantonErrorSchema } from '../../../schemas/api/errors';
import {
  JsGetActiveContractsResponseItemSchema,
  type JsGetActiveContractsResponse,
  type JsGetActiveContractsResponseItem,
} from '../../../schemas/api/state';

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
  constructor(private readonly client: BaseClient) {}

  public async execute(params: GetActiveContractsParams): Promise<JsGetActiveContractsResponse> {
    const validated = ActiveContractsParamsSchema.parse(params);

    // Determine activeAtOffset (default to ledger end if not specified)
    let { activeAtOffset } = validated;
    if (activeAtOffset === undefined) {
      const ledgerClient = this.client as unknown as LedgerJsonApiClient;
      const ledgerEnd = await ledgerClient.getLedgerEnd({});
      activeAtOffset = ledgerEnd.offset;
    }

    // Build request message with server-side template filter
    const partyList =
      validated.parties && validated.parties.length > 0 ? validated.parties : this.client.buildPartyList();

    const requestMessage = {
      filter: undefined as unknown,
      verbose: false,
      activeAtOffset,
      eventFormat: {
        verbose: false,
        filtersByParty: Object.fromEntries(
          partyList.map((p) => [
            p,
            {
              cumulative:
                validated.templateIds && validated.templateIds.length > 0
                  ? validated.templateIds.map((templateId) => ({
                      identifierFilter: {
                        TemplateFilter: {
                          value: {
                            templateId,
                            includeCreatedEventBlob: validated.includeCreatedEventBlob ?? false,
                          },
                        },
                      },
                    }))
                  : [],
            },
          ])
        ),
      },
    } as const;

    const wsClient = new WebSocketClient(this.client);

    return new Promise<JsGetActiveContractsResponse>((resolve, reject) => {
      const results: JsGetActiveContractsResponse = [];
      let settled = false;

      void wsClient
        .connect<typeof requestMessage, unknown>(path, requestMessage, {
          onMessage: (raw) => {
            try {
              const parsed = WebSocketErrorUtils.parseUnion(
                raw,
                z.union([JsGetActiveContractsResponseItemSchema, JsCantonErrorSchema, WsCantonErrorSchema]),
                'GetActiveContracts'
              ) as unknown as
                | z.infer<typeof JsGetActiveContractsResponseItemSchema>
                | z.infer<typeof JsCantonErrorSchema>
                | z.infer<typeof WsCantonErrorSchema>;

              // Distinguish item vs error union members
              if ('contractEntry' in (parsed as Record<string, unknown>)) {
                const item = parsed as JsGetActiveContractsResponseItem;
                results.push(item);
                if (typeof params.onItem === 'function') {
                  params.onItem(item);
                }
              } else if (!settled) {
                // Treat any non-item as an error message
                settled = true;
                reject(parsed as unknown as Error);
              }
            } catch (e) {
              if (!settled) {
                settled = true;
                reject(e as Error);
              }
            }
          },
          onError: (err) => {
            if (!settled) {
              settled = true;
              reject(err as Error);
            }
          },
          onClose: () => {
            if (!settled) {
              settled = true;
              resolve(results);
            }
          },
        })
        .catch((err) => {
          if (!settled) {
            settled = true;
            reject(err as Error);
          }
        });
    });
  }
}
