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

const GetContractByIdCreatedEventSchema: z.ZodType<GetContractByIdCreatedEvent> = LedgerCreatedEventSchema.transform(
  (event): GetContractByIdCreatedEvent => {
    const {
      acsDelta: _acsDelta,
      createdEventBlob: _createdEventBlob,
      interfaceViews: _interfaceViews,
      nodeId: _nodeId,
      offset: _offset,
      ...createdEvent
    } = event;
    return createdEvent;
  }
);

export const GetContractByIdResponseSchema: z.ZodType<GetContractByIdResponse> = z
  .strictObject({
    createdEvent: GetContractByIdCreatedEventSchema,
  })
  .superRefine((response, context) => {
    const { observers, representativePackageId, signatories, templateId, witnessParties } = response.createdEvent;
    if (representativePackageId !== templateId.slice(0, templateId.indexOf(':'))) {
      context.addIssue({
        code: 'custom',
        message: 'Expected representativePackageId to match the contract template package ID',
        path: ['createdEvent', 'representativePackageId'],
      });
    }

    const stakeholders = new Set<string>([...signatories, ...(observers ?? [])]);
    const nonStakeholderWitness = witnessParties.find((party) => !stakeholders.has(party));
    if (nonStakeholderWitness !== undefined) {
      context.addIssue({
        code: 'custom',
        message: `Returned witness ${JSON.stringify(nonStakeholderWitness)} is not a contract stakeholder`,
        path: ['createdEvent', 'witnessParties'],
      });
    }
  });

/** Bind a contract lookup response to the exact request body used by the successful attempt. */
export function createGetContractByIdResponseSchema(
  params: GetContractByIdRequest
): z.ZodType<GetContractByIdResponse> {
  return GetContractByIdResponseSchema.superRefine((response, context) => {
    const { createdEvent } = response;
    if (createdEvent.contractId !== params.contractId) {
      context.addIssue({
        code: 'custom',
        message: 'Returned contract ID does not match the requested contract ID',
        path: ['createdEvent', 'contractId'],
      });
    }

    if (params.queryingParties !== undefined && params.queryingParties.length > 0) {
      const queryingParties = new Set<string>(params.queryingParties);
      const unexpectedWitness = createdEvent.witnessParties.find((party) => !queryingParties.has(party));
      if (unexpectedWitness !== undefined) {
        context.addIssue({
          code: 'custom',
          message: `Returned witness ${JSON.stringify(unexpectedWitness)} was not a querying party`,
          path: ['createdEvent', 'witnessParties'],
        });
      }
    }
  });
}
