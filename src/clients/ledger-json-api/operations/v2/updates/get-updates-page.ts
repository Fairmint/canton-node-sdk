import { z } from 'zod';
import { ApiError } from '../../../../../core/errors';
import { ApiOperation } from '../../../../../core/operations/ApiOperation';
import { createApiOperation } from '../../../../../core/operations/ApiOperationFactory';
import { type OperationExecuteOptions } from '../../../../../core/operations/operation-execute-options';
import { parseJsonLosslesslyWithElements } from '../../../../../core/utils/lossless-json';
import { isRecord } from '../../../../../core/utils/type-guards';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { UpdateFormatSchema } from '../../../schemas/operations/updates';
import { type RawFrameKind } from '../utils/raw-frame-stream';
import { type RawUpdateKind } from './subscribe-to-raw-updates';

const endpoint = '/v2/updates/get-updates-page' as const;

/** Parameters of `getUpdatesPage` and `getRawUpdatesPage`: the Ledger API's `GetUpdatesPageRequest`. */
export const GetUpdatesPageParamsSchema = z.object({
  /** What to read. Build it with `buildUpdateFormat`, e.g. `buildUpdateFormat({ anyParty: true })`. */
  updateFormat: UpdateFormatSchema,
  /**
   * Only updates after this offset. Zero or omitted means from the pruning offset (or the ledger begin). Every page of
   * one read repeats the same value.
   */
  beginOffsetExclusive: z.number().int().min(0).optional(),
  /** Only updates up to and including this offset; omitted means below the current ledger end. */
  endOffsetInclusive: z.number().int().min(0).optional(),
  /** Most updates in the page; the participant applies its own default and limit. */
  maxPageSize: z.number().int().positive().optional(),
  /** Pages from `endOffsetInclusive` downwards. */
  descendingOrder: z.boolean().optional(),
  /** `nextPageToken` of the previous page, to read the next one with otherwise identical parameters. */
  pageToken: z.string().optional(),
});

export type GetUpdatesPageParams = z.infer<typeof GetUpdatesPageParamsSchema>;
export type GetUpdatesPageRequest = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type GetUpdatesPageResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

/** The request body: the validated parameters, with absent ones left out. */
function buildPageRequest(params: GetUpdatesPageParams): Record<string, unknown> {
  return {
    updateFormat: params.updateFormat,
    ...(params.beginOffsetExclusive !== undefined && { beginOffsetExclusive: params.beginOffsetExclusive }),
    ...(params.endOffsetInclusive !== undefined && { endOffsetInclusive: params.endOffsetInclusive }),
    ...(params.maxPageSize !== undefined && { maxPageSize: params.maxPageSize }),
    ...(params.descendingOrder !== undefined && { descendingOrder: params.descendingOrder }),
    ...(params.pageToken !== undefined && { pageToken: params.pageToken }),
  };
}

/**
 * Reads one page of updates (`POST /v2/updates/get-updates-page`), parsed as JSON without any schema normalization.
 *
 * Read every page by passing each page's `nextPageToken` with otherwise identical parameters until it is absent.
 * Without `endOffsetInclusive` the token is always present, so polling it tails the ledger. For the exact response
 * text, use `getRawUpdatesPage`.
 *
 * @example
 *   ```typescript
 *   const page = await client.getUpdatesPage({
 *     updateFormat: buildUpdateFormat({ anyParty: true, includeTopologyEvents: true }),
 *     beginOffsetExclusive: 1000,
 *     endOffsetInclusive: 2000,
 *     maxPageSize: 100,
 *   });
 *   ```;
 */
export const GetUpdatesPage = createApiOperation<GetUpdatesPageParams, GetUpdatesPageResponse>({
  paramsSchema: GetUpdatesPageParamsSchema,
  method: 'POST',
  requestSemantics: 'read',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: buildPageRequest,
});

/** The same request, resolving with the response body as text. Not exported: `GetRawUpdatesPage` decodes it. */
const GetUpdatesPageText = createApiOperation<GetUpdatesPageParams, string>({
  paramsSchema: GetUpdatesPageParamsSchema,
  method: 'POST',
  requestSemantics: 'read',
  requestConfig: { contentType: 'application/json', includeBearerToken: true, responseType: 'text' },
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: buildPageRequest,
});

/** One update of a raw page: the page's item exactly as received and as parsed, with its kind and offset. */
export interface RawPageUpdate {
  /**
   * The item exactly as it appears in the response text, `{ "update": { "<kind>": { "value": { ... } } } }`, without
   * the whitespace or comma around it. Store this to keep the bytes the participant sent: re-serializing `json` would
   * not (JavaScript moves integer-like keys first and drops whitespace).
   */
  readonly text: string;
  /** `JSON.parse(text)`, unnormalized: every number in it equals the number written in `text`, and no key was dropped. */
  readonly json: unknown;
  readonly kind: RawFrameKind<RawUpdateKind>;
  /** The update's offset; every known kind carries one. */
  readonly offset: number | undefined;
}

/** A page of updates exactly as the participant sent it. */
export interface RawUpdatesPage {
  /** The response body as received (its UTF-8 text). */
  readonly text: string;
  /** `JSON.parse(text)`, unnormalized; every number in it equals the number written in `text`, and no key was dropped. */
  readonly json: unknown;
  /** The page's lower bound: its updates have greater offsets. */
  readonly lowestPageOffsetExclusive: number;
  /** The page's upper bound. A reader's cursor moves here even when the last offsets carry no visible update. */
  readonly highestPageOffsetInclusive: number;
  /** Token for the next page, or `undefined` on the last page (an absent or empty token). */
  readonly nextPageToken: string | undefined;
  /** The page's updates in the order received, each with its exact text (`[]` when the page has none). */
  readonly updates: readonly RawPageUpdate[];
}

const OFFSET_KINDS: readonly string[] = ['OffsetCheckpoint', 'Reassignment', 'TopologyTransaction', 'Transaction'];

function malformedPage(detail: string): ApiError {
  return new ApiError(`Malformed get-updates-page response: ${detail}`);
}

function readBound(page: Record<string, unknown>, key: string): number {
  const value = page[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw malformedPage(`${key} is not a non-negative integer`);
  }
  return value;
}

function decodePageUpdate(item: unknown, text: string, index: number): RawPageUpdate {
  const update = isRecord(item) ? item['update'] : undefined;
  const kinds = isRecord(update) ? Object.keys(update) : [];
  const [kind] = kinds;
  if (!isRecord(update) || kind === undefined || kinds.length !== 1) {
    throw malformedPage(`updates[${index}] is not { "update": { "<kind>": ... } }`);
  }
  const variant = update[kind];
  const rawOffset = isRecord(variant) && isRecord(variant['value']) ? variant['value']['offset'] : undefined;
  const offset =
    typeof rawOffset === 'number' && Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? rawOffset : undefined;
  if (offset === undefined && OFFSET_KINDS.includes(kind)) {
    throw malformedPage(`updates[${index}] (${kind}) has no offset`);
  }
  return { text, json: item, kind, offset };
}

/**
 * Decodes a get-updates-page response body without normalizing it.
 *
 * @throws LossyJsonError if `JSON.parse` would change a number or drop a repeated key
 * @throws ApiError if the body is not a page
 */
export function decodeRawUpdatesPage(text: unknown): RawUpdatesPage {
  if (typeof text !== 'string') throw malformedPage('the body is not text');
  let json: unknown;
  let updateTexts: readonly string[] | undefined;
  try {
    ({ value: json, elements: updateTexts } = parseJsonLosslesslyWithElements(text, 'updates'));
  } catch (error) {
    if (error instanceof SyntaxError) throw malformedPage(`the body is not JSON (${error.message})`);
    throw error;
  }
  if (!isRecord(json)) throw malformedPage('the body is not a JSON object');
  const lowestPageOffsetExclusive = readBound(json, 'lowestPageOffsetExclusive');
  const highestPageOffsetInclusive = readBound(json, 'highestPageOffsetInclusive');
  if (highestPageOffsetInclusive < lowestPageOffsetExclusive) {
    throw malformedPage(`bounds (${lowestPageOffsetExclusive}, ${highestPageOffsetInclusive}] are reversed`);
  }
  const { nextPageToken, updates = [] } = json;
  if (nextPageToken !== undefined && nextPageToken !== null && typeof nextPageToken !== 'string') {
    throw malformedPage('nextPageToken is not a string');
  }
  if (!Array.isArray(updates)) throw malformedPage('updates is not an array');
  const itemTexts = updateTexts ?? [];
  if (itemTexts.length !== updates.length) {
    throw malformedPage(`found the text of ${itemTexts.length} of its ${updates.length} updates`);
  }
  return {
    text,
    json,
    lowestPageOffsetExclusive,
    highestPageOffsetInclusive,
    nextPageToken: typeof nextPageToken === 'string' && nextPageToken.length > 0 ? nextPageToken : undefined,
    updates: updates.map((item: unknown, index) => decodePageUpdate(item, itemTexts[index] ?? '', index)),
  };
}

/**
 * Reads one page of updates (`POST /v2/updates/get-updates-page`) exactly as the participant sent it: the response
 * text, its `JSON.parse` value (checked to keep every number and key, with no schema normalization), the page bounds
 * and token, and each update with its exact text, its parsed value, its kind and its offset.
 *
 * It takes the parameters, retries and cancellation of `getUpdatesPage`. A Canton error response is still parsed, so
 * the thrown `ApiError` carries its code (e.g. `PARTICIPANT_PRUNED_DATA_ACCESSED`).
 *
 * @example
 *   ```typescript
 *   const updateFormat = buildUpdateFormat({ anyParty: true, includeCreatedEventBlob: true, includeTopologyEvents: true });
 *   let pageToken: string | undefined;
 *   do {
 *     const page = await client.getRawUpdatesPage({
 *       updateFormat,
 *       beginOffsetExclusive: begin,
 *       endOffsetInclusive: end,
 *       maxPageSize: 200,
 *       ...(pageToken !== undefined && { pageToken }),
 *     });
 *     await store(page.updates, page.highestPageOffsetInclusive);
 *     pageToken = page.nextPageToken;
 *   } while (pageToken !== undefined);
 *   ```;
 */
export class GetRawUpdatesPage extends ApiOperation<GetUpdatesPageParams, RawUpdatesPage> {
  public async execute(
    params: GetUpdatesPageParams,
    options?: OperationExecuteOptions<GetUpdatesPageParams>
  ): Promise<RawUpdatesPage> {
    const text = await new GetUpdatesPageText(this.client).execute(params, options);
    return decodeRawUpdatesPage(text);
  }
}
