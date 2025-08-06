import { SimpleBaseClient, ClientConfig } from '../../core';
import { GetTransferAgent } from './operations/get-transfer-agent';

// Import types from individual operation files
import type { GetTransferAgentParams } from './operations/get-transfer-agent';
import type { GetTransferAgentResponse } from './types';

/** Client for interacting with Lighthouse API */
export class LighthouseApiClient extends SimpleBaseClient {
  // Transfer Agent
  public getTransferAgent!: (params: GetTransferAgentParams) => Promise<GetTransferAgentResponse>;

  constructor(clientConfig?: ClientConfig) {
    super('LIGHTHOUSE_API', clientConfig);

    // Initialize operations
    this.getTransferAgent = new GetTransferAgent(this).execute.bind(new GetTransferAgent(this));
  }
} 