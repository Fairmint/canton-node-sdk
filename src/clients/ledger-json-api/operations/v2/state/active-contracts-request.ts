import { z } from 'zod';
import { ApiError } from '../../../../../core/errors';
import { DEFAULT_HTTP_TIMEOUT_MS } from '../../../../../core/http/HttpClient';
import type { LedgerJsonApiClient } from '../../../LedgerJsonApiClient.generated';
import {
  JsCantonErrorSchema,
  WsCantonErrorSchema,
  type JsCantonError,
  type WsCantonError,
} from '../../../schemas/api/errors';
import {
  JsGetActiveContractsResponseItemSchema,
  type JsGetActiveContractsResponseItem,
} from '../../../schemas/api/state';
import { buildEventFormat } from '../utils/event-format-builder';

/** WebSocket endpoint shared by the collecting and the streaming active-contracts reads. */
export const ACTIVE_CONTRACTS_PATH = '/v2/state/active-contracts' as const;

/**
 * Idle timeout for the active-contracts snapshot stream.
 *
 * The snapshot is a bounded stream that the server closes on its own, so silence this long means the connection is hung
 * rather than slow. Callers that expect longer gaps can raise it or pass `0` to wait indefinitely.
 *
 * Intentionally reuses {@link DEFAULT_HTTP_TIMEOUT_MS} rather than an independent literal: both exist to detect a hung
 * connection at the same "this is clearly stuck" horizon.
 */
const DEFAULT_IDLE_TIMEOUT_MS = DEFAULT_HTTP_TIMEOUT_MS;

export const ActiveContractsParamsSchema = z.object({
  /** Optional list of parties to scope the filter. */
  parties: z.array(z.string()).optional(),
  /** Optional template filters applied server-side. */
  templateIds: z.array(z.string()).optional(),
  /** Optional interface filters applied server-side. */
  interfaceIds: z.array(z.string()).optional(),
  /** Include interface views in InterfaceFilter results (default true). */
  includeInterfaceView: z.boolean().optional(),
  /** Include created event blobs in template and interface filter results (default false). */
  includeCreatedEventBlob: z.boolean().optional(),
  /** Allow caller to omit activeAtOffset; we'll default to ledger end */
  activeAtOffset: z.number().optional(),
  /** Fail the snapshot when no message arrives for this many milliseconds. `0` waits indefinitely. */
  idleTimeoutMs: z.number().min(0).optional(),
});

export type ActiveContractsParams = z.infer<typeof ActiveContractsParamsSchema>;

/** Request message for the active contracts WebSocket endpoint. */
export interface ActiveContractsRequestMessage {
  verbose: boolean;
  activeAtOffset: number;
  eventFormat: ReturnType<typeof buildEventFormat>;
}

export interface ActiveContractsRequest {
  readonly requestMessage: ActiveContractsRequestMessage;
  readonly idleTimeoutMs: number;
}

/**
 * Validates the parameters and builds the snapshot request. The offset defaults to the ledger end and the parties to
 * the client's party list.
 */
export async function buildActiveContractsRequest(
  client: LedgerJsonApiClient,
  params: ActiveContractsParams
): Promise<ActiveContractsRequest> {
  const validated = ActiveContractsParamsSchema.parse(params);

  // Determine activeAtOffset (default to ledger end if not specified)
  let activeAtOffset: number;
  if (validated.activeAtOffset !== undefined) {
    ({ activeAtOffset } = validated);
  } else {
    const ledgerEnd = await client.getLedgerEnd({});
    const { offset } = ledgerEnd;
    if (offset === undefined) {
      throw new ApiError('Ledger end response did not include an offset');
    }
    activeAtOffset = offset;
  }

  // Build party list - default to client's party list if not provided
  const partyList = validated.parties && validated.parties.length > 0 ? validated.parties : client.buildPartyList();

  // Build event format
  const eventFormat = buildEventFormat({
    parties: partyList,
    ...(validated.templateIds !== undefined && { templateIds: validated.templateIds }),
    ...(validated.interfaceIds !== undefined && { interfaceIds: validated.interfaceIds }),
    ...(validated.includeInterfaceView !== undefined && {
      includeInterfaceView: validated.includeInterfaceView,
    }),
    ...(validated.includeCreatedEventBlob !== undefined && {
      includeCreatedEventBlob: validated.includeCreatedEventBlob,
    }),
  });

  return {
    requestMessage: {
      verbose: false,
      activeAtOffset,
      eventFormat,
    },
    idleTimeoutMs: validated.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
  };
}

const ActiveContractsResponseMessageSchema = z.union([
  JsGetActiveContractsResponseItemSchema,
  JsCantonErrorSchema,
  WsCantonErrorSchema,
]);

/** One decoded snapshot frame: an item, or the error that a Canton error frame or an unexpected frame stands for. */
export type ActiveContractsFrame = { readonly item: JsGetActiveContractsResponseItem } | { readonly error: ApiError };

/** Convert a Canton error response to a proper Error object */
function toError(errorResponse: JsCantonError | WsCantonError): ApiError {
  // JsCantonError has 'message' string, WsCantonError has 'cause' string
  // JsCantonError has code as object, WsCantonError has code as string
  if ('cause' in errorResponse) {
    // WsCantonError
    return new ApiError(`WebSocket error [${errorResponse.code}]: ${errorResponse.cause}`);
  }
  // JsCantonError
  const codeStr = JSON.stringify(errorResponse.code);
  return new ApiError(`WebSocket error [${codeStr}]: ${errorResponse.message}`);
}

/** Close code the participant sends once it has sent the whole snapshot. */
const SNAPSHOT_COMPLETE_CLOSE_CODE = 1000;

/**
 * The error a socket close stands for, or `undefined` when the close completes the snapshot.
 *
 * The participant reports failures as error frames and closes with 1000 after the last item. Every close that
 * `WebSocketClient` starts itself reports an error first, so any other code that reaches `onClose` comes from the peer
 * or the network: a dropped connection (1006), a proxy idle timeout or a server going away (1001). The items received
 * before it are only part of the snapshot.
 */
export function activeContractsCloseError(code: number, reason: string): ApiError | undefined {
  if (code === SNAPSHOT_COMPLETE_CLOSE_CODE) return undefined;
  return new ApiError(
    `Active-contracts stream closed before the snapshot completed [${code}]${reason === '' ? '' : `: ${reason}`}`
  );
}

export function decodeActiveContractsFrame(parsed: unknown): ActiveContractsFrame {
  const decoded = ActiveContractsResponseMessageSchema.safeParse(parsed);
  if (!decoded.success) {
    return { error: new ApiError('Unexpected active-contracts WebSocket message') };
  }
  const message = decoded.data;

  // Distinguish item vs error union members; treat any non-item as an error message
  return 'contractEntry' in message ? { item: message } : { error: toError(message) };
}
