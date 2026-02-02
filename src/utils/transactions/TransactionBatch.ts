import { type LedgerJsonApiClient } from '../../clients';
import { type Command, type DisclosedContract } from '../../clients/ledger-json-api/schemas';

interface SubmitParams {
  actAs: string[];
  readAs?: string[];
  commands: Command[];
  disclosedContracts?: DisclosedContract[];
}

export class TransactionBatch {
  private readonly client: LedgerJsonApiClient;
  private readonly actAs: string[];
  private readonly readAs: string[] | undefined;
  private disclosedContracts: DisclosedContract[] = [];
  private commands: Command[] = [];

  constructor(client: LedgerJsonApiClient, actAs: string[], readAs?: string[]) {
    this.client = client;
    this.actAs = actAs;
    this.readAs = readAs;
  }

  public addDisclosedContracts(contracts: DisclosedContract[]): this {
    this.disclosedContracts.push(...contracts);
    return this;
  }

  public addCommand(command: Command): this {
    this.commands.push(command);
    return this;
  }

  public addCommands(commands: Command[]): this {
    this.commands.push(...commands);
    return this;
  }

  public addBuiltCommand(input: { command: Command; disclosedContracts?: DisclosedContract[] }): this {
    this.commands.push(input.command);
    if (input.disclosedContracts && input.disclosedContracts.length > 0) {
      this.disclosedContracts.push(...input.disclosedContracts);
    }
    return this;
  }

  public clear(): this {
    this.commands = [];
    this.disclosedContracts = [];
    return this;
  }

  private prepareSubmitParams(): SubmitParams {
    // Dedupe disclosed contracts by contractId
    this.disclosedContracts = Array.from(
      new Map(this.disclosedContracts.map((contract) => [contract.contractId, contract])).values()
    );

    const params: SubmitParams = {
      actAs: this.actAs,
      commands: this.commands,
    };

    if (this.readAs !== undefined) {
      params.readAs = this.readAs;
    }

    if (this.disclosedContracts.length > 0) {
      params.disclosedContracts = this.disclosedContracts;
    }

    return params;
  }

  public async submitAndWaitForTransactionTree(): Promise<{ updateId: string }> {
    const submitParams = this.prepareSubmitParams();
    const response = await this.client.submitAndWaitForTransactionTree(submitParams);
    return { updateId: response.transactionTree.updateId };
  }

  public async submitAndWait(): Promise<{ updateId: string }> {
    const submitParams = this.prepareSubmitParams();
    const response = await this.client.submitAndWait(submitParams);
    return { updateId: response.updateId };
  }

  public async asyncSubmit(): Promise<void> {
    const submitParams = this.prepareSubmitParams();
    await this.client.asyncSubmit(submitParams);
  }
}
