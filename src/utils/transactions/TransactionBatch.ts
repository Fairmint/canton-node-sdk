import { type LedgerJsonApiClient } from '../../clients';
import { type Command, type DisclosedContract } from '../../clients/ledger-json-api/schemas';

interface SubmitParams {
  actAs: string[];
  readAs?: string[];
  commands: Command[];
  disclosedContracts?: DisclosedContract[];
}

/**
 * Builder for batching multiple commands into a single ledger submission.
 *
 * Uses a fluent API so you can chain calls:
 *
 * @example
 *   const result = await new TransactionBatch(client, [partyId])
 *     .addCommand(exerciseCmd)
 *     .addDisclosedContracts(disclosed)
 *     .submitAndWaitForTransactionTree();
 */
export class TransactionBatch {
  private readonly client: LedgerJsonApiClient;
  private readonly actAs: readonly string[];
  private readonly readAs: readonly string[] | undefined;
  private disclosedContracts: DisclosedContract[] = [];
  private commands: Command[] = [];

  constructor(client: LedgerJsonApiClient, actAs: readonly string[], readAs?: readonly string[]) {
    this.client = client;
    this.actAs = actAs;
    this.readAs = readAs;
  }

  /** Appends disclosed contracts (deduped by contractId on submit). */
  public addDisclosedContracts(contracts: readonly DisclosedContract[]): this {
    this.disclosedContracts.push(...contracts);
    return this;
  }

  /** Appends a single command. */
  public addCommand(command: Command): this {
    this.commands.push(command);
    return this;
  }

  /** Appends multiple commands. */
  public addCommands(commands: readonly Command[]): this {
    this.commands.push(...commands);
    return this;
  }

  /** Appends a command and its optional disclosed contracts in one call. */
  public addBuiltCommand(input: {
    readonly command: Command;
    readonly disclosedContracts?: readonly DisclosedContract[];
  }): this {
    this.commands.push(input.command);
    if (input.disclosedContracts && input.disclosedContracts.length > 0) {
      this.disclosedContracts.push(...input.disclosedContracts);
    }
    return this;
  }

  /** Removes all queued commands and disclosed contracts. */
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
      actAs: [...this.actAs],
      commands: this.commands,
    };

    if (this.readAs !== undefined) {
      params.readAs = [...this.readAs];
    }

    if (this.disclosedContracts.length > 0) {
      params.disclosedContracts = this.disclosedContracts;
    }

    return params;
  }

  /** Submits all queued commands and waits for a transaction tree response. */
  public async submitAndWaitForTransactionTree(): Promise<{ readonly updateId: string }> {
    const submitParams = this.prepareSubmitParams();
    const response = await this.client.submitAndWaitForTransactionTree(submitParams);
    return { updateId: response.transactionTree.updateId };
  }

  /** Submits all queued commands and waits for completion. */
  public async submitAndWait(): Promise<{ readonly updateId: string }> {
    const submitParams = this.prepareSubmitParams();
    const response = await this.client.submitAndWait(submitParams);
    return { updateId: response.updateId };
  }

  /** Submits all queued commands asynchronously (fire-and-forget). */
  public async asyncSubmit(): Promise<void> {
    const submitParams = this.prepareSubmitParams();
    await this.client.asyncSubmit(submitParams);
  }
}
