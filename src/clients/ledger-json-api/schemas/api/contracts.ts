import { z } from 'zod';
import { createRequestSchema, type ContractId, type PartyId } from '../../../../core';
import type { paths } from '../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { LedgerContractIdSchema, LedgerPartyIdSchema } from '../wire';
import { LedgerCreatedEventSchema, type LedgerCreatedEvent } from './created-event';

type ContractByIdEndpoint = '/v2/contracts/contract-by-id';

type GeneratedGetContractByIdRequest =
  paths[ContractByIdEndpoint]['post']['requestBody']['content']['application/json'];

/** Exact request body for the pinned Ledger contract-by-id endpoint with validated identifiers. */
export type GetContractByIdRequest = Omit<GeneratedGetContractByIdRequest, 'contractId' | 'queryingParties'> & {
  contractId: ContractId;
  queryingParties?: PartyId[];
};

type GeneratedGetContractByIdResponse =
  paths[ContractByIdEndpoint]['post']['responses']['200']['content']['application/json'];

/** Meaningful contract data returned by contract-by-ID after unusable synthetic event fields are removed. */
export type GetContractByIdCreatedEvent = Omit<
  LedgerCreatedEvent,
  'acsDelta' | 'createdEventBlob' | 'interfaceViews' | 'nodeId' | 'offset'
>;

/** Contract-by-ID response with lossless Daml values and only semantically meaningful fields. */
export type GetContractByIdResponse = Omit<GeneratedGetContractByIdResponse, 'createdEvent'> & {
  createdEvent: GetContractByIdCreatedEvent;
};

export const GetContractByIdRequestSchema = createRequestSchema<GetContractByIdRequest>()({
  contractId: LedgerContractIdSchema,
  queryingParties: z.array(LedgerPartyIdSchema).optional(),
});

const GetContractByIdCreatedEventSchema: z.ZodType<GetContractByIdCreatedEvent> = LedgerCreatedEventSchema.superRefine(
  (event, context) => {
    const addExactPlaceholderIssue = (condition: boolean, path: PropertyKey[], message: string): void => {
      if (!condition) {
        context.addIssue({ code: 'custom', message, path });
      }
    };

    addExactPlaceholderIssue(event.offset === 1, ['offset'], 'Expected pinned placeholder offset 1');
    addExactPlaceholderIssue(event.nodeId === 0, ['nodeId'], 'Expected pinned placeholder nodeId 0');
    addExactPlaceholderIssue(!event.acsDelta, ['acsDelta'], 'Expected pinned placeholder acsDelta false');
    addExactPlaceholderIssue(
      event.interfaceViews?.length === 0,
      ['interfaceViews'],
      'Expected pinned empty interfaceViews placeholder'
    );
    addExactPlaceholderIssue(
      (event.createdEventBlob?.length ?? 0) > 0,
      ['createdEventBlob'],
      'Expected pinned non-empty createdEventBlob placeholder'
    );
  }
).transform((event): GetContractByIdCreatedEvent => {
  const {
    acsDelta: _acsDelta,
    createdEventBlob: _createdEventBlob,
    interfaceViews: _interfaceViews,
    nodeId: _nodeId,
    offset: _offset,
    ...createdEvent
  } = event;
  return createdEvent;
});

export const GetContractByIdResponseSchema: z.ZodType<GetContractByIdResponse> = z.strictObject({
  createdEvent: GetContractByIdCreatedEventSchema,
});
