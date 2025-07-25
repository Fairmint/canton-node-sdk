import { BaseClient, ClientConfig } from '../../core';
{{OPERATION_IMPORTS}}

// Import types from individual operation files
{{TYPE_IMPORTS}}

/** Client for interacting with Canton's Ledger JSON API */
export class LedgerJsonApiClient extends BaseClient {
  // Commands
{{COMMAND_METHODS}}

  // Events
{{EVENT_METHODS}}

  // Updates
{{UPDATE_METHODS}}

  // State
{{STATE_METHODS}}

  // Users
{{USER_METHODS}}

  // Parties
{{PARTY_METHODS}}

  /**
   * List all packages uploaded on the participant node
   * @description List all packages uploaded on the participant node
   * @returns The list of package IDs available on the participant node.
   * @example
   * ```typescript
   * const packages = await client.listPackages();
   * console.log(`Available packages: ${packages.packageIds.join(', ')}`);
   * ```
   */
  public listPackages!: () => Promise<import('../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi').paths['/v2/packages']['get']['responses']['200']['content']['application/json']>;

  /**
   * Upload a DAR file to the participant node
   * @description Upload a DAR file to the participant node
   * @returns The upload result.
   * @example
   * ```typescript
   * const result = await client.uploadDarFile({
   *   darFile: fs.readFileSync('my-package.dar'),
   *   submissionId: 'unique-submission-id'
   * });
   * ```
   */
  public uploadDarFile!: (params: UploadDarFileParams) => Promise<UploadDarFileResponse>;

  /**
   * Get the version details of the participant node
   * @description Get the version details of the participant node
   * @returns The version information of the participant node.
   * @example
   * ```typescript
   * const version = await client.getVersion();
   * console.log(`Participant version: ${version.version}`);
   * ```
   */
  public getVersion!: () => Promise<import('../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi').paths['/v2/version']['get']['responses']['200']['content']['application/json']>;

  // Interactive Submission
{{INTERACTIVE_SUBMISSION_METHODS}}

  constructor(clientConfig: ClientConfig) {
    super('LEDGER_JSON_API', clientConfig);
    
    // Commands
{{COMMAND_IMPLEMENTATIONS}}

    // Events
{{EVENT_IMPLEMENTATIONS}}

    // Updates
{{UPDATE_IMPLEMENTATIONS}}

    // State
{{STATE_IMPLEMENTATIONS}}

    // Users
{{USER_IMPLEMENTATIONS}}

    // Parties
{{PARTY_IMPLEMENTATIONS}}

    this.listPackages = () => new ListPackages(this).execute();
    this.uploadDarFile = (params) => new UploadDarFile(this).execute(params);
    this.getVersion = () => new (require('./operations/v2/version/get').GetVersion)(this).execute();

    // Interactive Submission
{{INTERACTIVE_SUBMISSION_IMPLEMENTATIONS}}
  }
}