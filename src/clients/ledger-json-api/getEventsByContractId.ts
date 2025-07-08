import { AbstractClient } from '../base';
import { EventsByContractIdRequest, EventsByContractIdResponse } from './schemas';

export interface GetEventsByContractIdParams {
  contractId: string;
  readAs?: string[];
}

export class GetEventsByContractId {
  constructor(private client: AbstractClient) {}

  async execute(
    params: GetEventsByContractIdParams
  ): Promise<EventsByContractIdResponse> {
    this.validateParams(params);

    const managedParties = this.client
      .getConfig()
      .getManagedParties(this.client.network, this.client.providerType);

    const readParties = Array.from(
      new Set([
        this.client.provider.JSON_API.PARTY_ID,
        ...managedParties,
        ...(params.readAs || []),
      ])
    ).filter((party): party is string => party !== undefined);

    const request: EventsByContractIdRequest = {
      contractId: params.contractId,
      eventFormat: {
        verbose: true,
        filtersByParty: {
          ...readParties.reduce(
            (acc, party) => {
              acc[party] = {
                cumulative: [],
              };
              return acc;
            },
            {} as Record<string, { cumulative: string[] }>
          ),
        },
      },
    };

    try {
      const response =
        await this.client.makePostRequest<EventsByContractIdResponse>(
          `${this.client.provider.JSON_API.API_URL}/events/events-by-contract-id`,
          request,
          { contentType: 'application/json', includeBearerToken: true }
        );

      if (!response) {
        throw new Error(
          `No response received for contractId: ${params.contractId}`
        );
      }

      return response;
    } catch (error) {
      throw this.handleError(error, 'get events by contract ID');
    }
  }

  private validateParams(params: GetEventsByContractIdParams): void {
    if (
      !params.contractId ||
      params.contractId === 'undefined' ||
      params.contractId.trim() === ''
    ) {
      throw new Error(
        `Invalid contractId: "${params.contractId}". contractId must be a non-empty string.`
      );
    }
  }

  private handleError(error: unknown, operation: string): Error {
    if (error instanceof Error) {
      return new Error(`Failed to ${operation}: ${error.message}`);
    }
    return new Error(`Failed to ${operation}: ${String(error)}`);
  }
}
