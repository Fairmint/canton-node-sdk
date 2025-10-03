import { type LedgerJsonApiClient } from "../../clients";
import { type DisclosedContract, type Command } from "../../clients/ledger-json-api/schemas";

export interface BatchSubmitResult {
  updateId: string;
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

  public async submit(): Promise<BatchSubmitResult> {
    // Dedupe disclosed contracts by contractId
    this.disclosedContracts = Array.from(
      new Map(
        this.disclosedContracts.map(contract => [
          contract.contractId,
          contract
        ])
      ).values()
    );
    const response = (await this.client.submitAndWaitForTransactionTree({
      actAs: this.actAs,
      ...(this.readAs ? { readAs: this.readAs } : {}),
      commands: this.commands,
      ...(this.disclosedContracts.length > 0
        ? { disclosedContracts: this.disclosedContracts }
        : {}),
    }));

    return { updateId: response.transactionTree.updateId };
  }
}


