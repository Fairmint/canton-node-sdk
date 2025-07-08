import { AbstractClient } from '../base';
import { TransactionTreeByOffsetResponse } from './schemas';
import { URLSearchParams } from 'url';

export interface GetTransactionTreeByOffsetParams {
  offset: string;
  parties?: string[];
}

export class GetTransactionTreeByOffset {
  constructor(private client: AbstractClient) {}

  async execute(
    params: GetTransactionTreeByOffsetParams
  ): Promise<TransactionTreeByOffsetResponse> {
    this.validateParams(params);

    let partyList = params.parties ?? [];
    const partyId = this.client.provider.JSON_API.PARTY_ID;
    if (partyId && !partyList.includes(partyId)) {
      partyList.push(partyId);
    }

    const managedParties = this.client
      .getConfig()
      .getManagedParties(this.client.network, this.client.providerType);

    if (managedParties.length > 0) {
      partyList = [...partyList, ...managedParties];
      partyList = [...new Set(partyList)];
    }

    const queryParams = new URLSearchParams();
    partyList.forEach(party => {
      queryParams.append('parties', party);
    });

    try {
      const response =
        await this.client.makeGetRequest<TransactionTreeByOffsetResponse>(
          `${this.client.provider.JSON_API.API_URL}/updates/transaction-tree-by-offset/${params.offset}?${queryParams.toString()}`,
          { contentType: 'application/json', includeBearerToken: true }
        );

      return response;
    } catch (error) {
      throw this.handleError(error, 'get transaction tree by offset');
    }
  }

  private validateParams(params: GetTransactionTreeByOffsetParams): void {
    if (
      !params.offset ||
      params.offset === 'undefined' ||
      params.offset.trim() === ''
    ) {
      throw new Error(
        `Invalid offset: "${params.offset}". offset must be a non-empty string.`
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
