{{OPERATION_IMPORTS}}

import { BaseClient, ClientConfig } from '{{BASE_IMPORT_PATH}}';
{{TYPE_IMPORTS}}
{{CUSTOM_IMPORTS}}

/** Client for interacting with Canton's {{CLIENT_DESCRIPTION}} */
export class {{CLIENT_CLASS_NAME}} extends BaseClient {
{{METHOD_DECLARATIONS}}

  constructor(clientConfig: ClientConfig) {
    super('{{CLIENT_TYPE}}', clientConfig);
    {{CONSTRUCTOR_BODY}}
  }

  {{INITIALIZATION_METHOD}}
}