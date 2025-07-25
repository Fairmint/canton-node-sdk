#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

interface ClientConfig {
  name: string;
  templatePath: string;
  outputPath: string;
  operationsDir: string;
  clientType: string;
  clientDescription: string;
  className: string;
  baseImportPath: string;
  hasInitializationMethod: boolean;
  customImports?: string[];
  schemasImportPath?: string;
  useCategorizedTemplate?: boolean;
}

const CLIENTS: ClientConfig[] = [
  {
    name: 'LedgerJsonApiClient',
    templatePath: '../src/clients/ledger-json-api/LedgerJsonApiClient.template.ts',
    outputPath: '../src/clients/ledger-json-api/LedgerJsonApiClient.ts',
    operationsDir: '../src/clients/ledger-json-api/operations/v2',
    clientType: 'LEDGER_JSON_API',
    clientDescription: 'Ledger JSON API',
    className: 'LedgerJsonApiClient',
    baseImportPath: '../../core',
    hasInitializationMethod: false,
    schemasImportPath: './schemas',
    useCategorizedTemplate: true,
  },
  {
    name: 'ValidatorApiClient',
    templatePath: '../src/clients/validator-api/ValidatorApiClient.template.ts',
    outputPath: '../src/clients/validator-api/ValidatorApiClient.ts',
    operationsDir: '../src/clients/validator-api/operations/v0',
    clientType: 'VALIDATOR_API',
    clientDescription: 'Validator API',
    className: 'ValidatorApiClient',
    baseImportPath: '../../core',
    hasInitializationMethod: true,
    schemasImportPath: './schemas',
    customImports: [
      "import { operations as ansOperations } from '../../generated/apps/validator/src/main/openapi/ans-external';",
      "import { operations as scanProxyOperations } from '../../generated/apps/validator/src/main/openapi/scan-proxy';",
      "import { operations as validatorOperations } from '../../generated/apps/validator/src/main/openapi/validator-internal';",
      "import { operations as walletOperations } from '../../generated/apps/wallet/src/main/openapi/wallet-internal';",
    ],
  },
];

// Operation info interface
interface OperationInfo {
  operationName: string;
  paramsType: string;
  responseType: string;
  importPath: string;
  file: string;
}

// Recursively get all .ts files in a directory
function getAllTsFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllTsFiles(filePath));
    } else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
      results.push(filePath);
    }
  });
  return results;
}

// Extract operation info from a file
function extractOperationInfo(
  fileContent: string,
  file: string
): OperationInfo | null {
  // Matches: export const OperationName = createApiOperation<Params, Response>({...})
  const regex =
    /export const (\w+) = createApiOperation<\s*([\w]+),\s*([\w]+)\s*>/s;
  const match = regex.exec(fileContent);
  if (!match || !match[1] || !match[2] || !match[3]) return null;

  return {
    operationName: match[1],
    paramsType: match[2],
    responseType: match[3],
    importPath: '',
    file,
  };
}

// Get relative import path
function relativeImportPath(from: string, to: string): string {
  let rel = path.relative(path.dirname(from), to).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel.replace(/\.ts$/, '');
}

// Convert operation name to method name
function operationNameToMethodName(operationName: string): string {
  return operationName.charAt(0).toLowerCase() + operationName.slice(1);
}

// Generate operation imports
function generateOperationImports(ops: OperationInfo[]): string {
  return ops
    .map(op => `import { ${op.operationName} } from '${op.importPath}';`)
    .join('\n');
}

// Generate type imports
function generateTypeImports(ops: OperationInfo[], client: ClientConfig): string {
  const imports: string[] = [];
  
  // Collect type imports from individual operation files
  const typeImports = new Map<string, Set<string>>();
  
  ops.forEach(op => {
    const fileContent = fs.readFileSync(op.file, 'utf8');
    
    // Extract export statements for params and response types
    const exportRegex = /export\s+(?:type|interface)\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(fileContent)) !== null) {
      const typeName = match[1];
      if (typeName === op.paramsType || typeName === op.responseType) {
        const importPath = relativeImportPath(
          path.join(__dirname, client.outputPath),
          op.file
        );
        imports.push(`import type { ${typeName} } from '${importPath}';`);
      }
    }
  });

  // For client types that are imported from schemas
  const schemaParamTypes = new Set<string>();
  const schemaResponseTypes = new Set<string>();
  
  ops.forEach(op => {
    const fileContent = fs.readFileSync(op.file, 'utf8');
    
    // Check if types are imported from schemas
    if (fileContent.includes(`} from '../schemas/operations'`) || 
        fileContent.includes(`} from '../../schemas/operations'`) ||
        fileContent.includes(`} from '../../../schemas/operations'`)) {
      if (op.paramsType !== 'void' && !fileContent.includes(`export type ${op.paramsType}`)) {
        schemaParamTypes.add(op.paramsType);
      }
    }
    
    if (fileContent.includes(`} from '../schemas/api'`) || 
        fileContent.includes(`} from '../../schemas/api'`) ||
        fileContent.includes(`} from '../../../schemas/api'`)) {
      if (!fileContent.includes(`export type ${op.responseType}`)) {
        schemaResponseTypes.add(op.responseType);
      }
    }
  });

  if (schemaParamTypes.size > 0 && client.schemasImportPath) {
    imports.push(`import { ${Array.from(schemaParamTypes).sort().join(', ')} } from '${client.schemasImportPath}/operations';`);
  }
  
  if (schemaResponseTypes.size > 0 && client.schemasImportPath) {
    imports.push(`import { ${Array.from(schemaResponseTypes).sort().join(', ')} } from '${client.schemasImportPath}/api';`);
  }

  return imports.join('\n');
}

// Generate method declarations
function generateMethodDeclarations(ops: OperationInfo[]): string {
  return ops
    .map(op => {
      const methodName = operationNameToMethodName(op.operationName);
      const paramsType = op.paramsType === 'void' ? 'void' : op.paramsType;
      return `  public ${methodName}!: (params: ${paramsType}) => Promise<${op.responseType}>;`;
    })
    .join('\n');
}

// Generate method implementations
function generateMethodImplementations(ops: OperationInfo[]): string {
  return ops
    .map(op => {
      const methodName = operationNameToMethodName(op.operationName);
      const params = op.paramsType === 'void' ? '' : 'params';
      const paramsPass = op.paramsType === 'void' ? '()' : '(params)';
      return `    this.${methodName} = ${params ? '(params)' : '()'} => new ${op.operationName}(this).execute${paramsPass};`;
    })
    .join('\n');
}

// Generate initialization method for ValidatorApiClient
function generateInitializationMethod(ops: OperationInfo[]): string {
  const implementations = generateMethodImplementations(ops);
  
  return `/**
   * Initializes method implementations by binding them to operation classes.
   * This is required because TypeScript declarations (above) only provide type safety,
   * but don't create the actual runtime method implementations.
   * 
   * Auto-generation happens via \`yarn generate-clients\` which:
   * 1. Scans operation files for \`createApiOperation\` usage
   * 2. Generates imports, method declarations, and implementations
   * 3. Creates the client file from the template
   */
  private initializeMethods(): void {
${implementations}
  }`;
}

// Categorize operations for LedgerJsonApiClient
function categorizeOperations(operations: OperationInfo[]): Record<string, OperationInfo[]> {
  const categories: Record<string, OperationInfo[]> = {
    commands: [],
    events: [],
    updates: [],
    state: [],
    users: [],
    parties: [],
    packages: [],
    'interactive-submission': [],
    version: [],
    other: [],
  };

  operations.forEach(op => {
    // Determine category based on file path
    const pathParts = op.file.split('/');
    const lastDir = pathParts[pathParts.length - 2];
    
    if (lastDir === 'async' || pathParts.includes('commands')) {
      categories.commands.push(op);
    } else if (pathParts.includes('events')) {
      categories.events.push(op);
    } else if (pathParts.includes('updates')) {
      categories.updates.push(op);
    } else if (pathParts.includes('state')) {
      categories.state.push(op);
    } else if (pathParts.includes('users')) {
      categories.users.push(op);
    } else if (pathParts.includes('parties')) {
      categories.parties.push(op);
    } else if (pathParts.includes('packages')) {
      categories.packages.push(op);
    } else if (pathParts.includes('interactive-submission')) {
      categories['interactive-submission'].push(op);
    } else if (pathParts.includes('version')) {
      categories.version.push(op);
    } else {
      categories.other.push(op);
    }
  });

  return categories;
}

// Process a client configuration
function processClient(client: ClientConfig): void {
  console.log(`Generating ${client.name}...`);

  // 1. Read template
  const templatePath = path.join(__dirname, client.templatePath);
  let template = fs.readFileSync(templatePath, 'utf8');

  // 2. Scan operation files
  const operationsDir = path.join(__dirname, client.operationsDir);
  const files = getAllTsFiles(operationsDir);

  const operations = files
    .map(file => {
      const content = fs.readFileSync(file, 'utf8');
      const info = extractOperationInfo(content, file);
      if (!info) return null;
      
      info.importPath = relativeImportPath(
        path.join(__dirname, client.outputPath),
        file
      );
      return info;
    })
    .filter(Boolean) as OperationInfo[];

  // 3. Generate sections
  const operationImports = generateOperationImports(operations);
  const typeImports = generateTypeImports(operations, client);
  const methodDeclarations = generateMethodDeclarations(operations);
  const methodImplementations = generateMethodImplementations(operations);
  const customImports = client.customImports ? client.customImports.join('\n') : '';

  // 4. Replace placeholders
  if (client.useCategorizedTemplate) {
    // Handle categorized template for LedgerJsonApiClient
    const categorized = categorizeOperations(operations);
    
    // Special handling for certain operations
    const specialOps = ['ListPackages', 'UploadDarFile', 'GetVersion'];
    const regularOps = operations.filter(op => !specialOps.includes(op.operationName));
    
    // Import the special operations
    let specialImports = '';
    operations.forEach(op => {
      if (op.operationName === 'ListPackages') {
        specialImports += `import { ListPackages } from '${op.importPath}';\n`;
      } else if (op.operationName === 'UploadDarFile') {
        specialImports += `import { UploadDarFile } from '${op.importPath}';\nimport type { UploadDarFileParams } from '${op.importPath}';\nimport type { UploadDarFileResponse } from './schemas/api';\n`;
      }
    });
    
    template = template.replace('{{OPERATION_IMPORTS}}', generateOperationImports(regularOps) + '\n' + specialImports);
    template = template.replace('{{TYPE_IMPORTS}}', typeImports);
    
    // Generate methods by category
    template = template.replace('{{COMMAND_METHODS}}', generateMethodDeclarations(categorized.commands));
    template = template.replace('{{EVENT_METHODS}}', generateMethodDeclarations(categorized.events));
    template = template.replace('{{UPDATE_METHODS}}', generateMethodDeclarations(categorized.updates));
    template = template.replace('{{STATE_METHODS}}', generateMethodDeclarations(categorized.state));
    template = template.replace('{{USER_METHODS}}', generateMethodDeclarations(categorized.users));
    template = template.replace('{{PARTY_METHODS}}', generateMethodDeclarations(categorized.parties));
    template = template.replace('{{INTERACTIVE_SUBMISSION_METHODS}}', generateMethodDeclarations(categorized['interactive-submission']));
    
    // Generate implementations by category
    template = template.replace('{{COMMAND_IMPLEMENTATIONS}}', generateMethodImplementations(categorized.commands));
    template = template.replace('{{EVENT_IMPLEMENTATIONS}}', generateMethodImplementations(categorized.events));
    template = template.replace('{{UPDATE_IMPLEMENTATIONS}}', generateMethodImplementations(categorized.updates));
    template = template.replace('{{STATE_IMPLEMENTATIONS}}', generateMethodImplementations(categorized.state));
    template = template.replace('{{USER_IMPLEMENTATIONS}}', generateMethodImplementations(categorized.users));
    template = template.replace('{{PARTY_IMPLEMENTATIONS}}', generateMethodImplementations(categorized.parties));
    template = template.replace('{{INTERACTIVE_SUBMISSION_IMPLEMENTATIONS}}', generateMethodImplementations(categorized['interactive-submission']));
  } else {
    // Standard template replacements
    template = template.replace('{{BASE_IMPORT_PATH}}', client.baseImportPath);
    template = template.replace('{{OPERATION_IMPORTS}}', operationImports);
    template = template.replace('{{TYPE_IMPORTS}}', typeImports);
    template = template.replace('{{CUSTOM_IMPORTS}}', customImports);
    template = template.replace('{{CLIENT_DESCRIPTION}}', client.clientDescription);
    template = template.replace('{{CLIENT_CLASS_NAME}}', client.className);
    template = template.replace('{{CLIENT_TYPE}}', client.clientType);
    template = template.replace('{{METHOD_DECLARATIONS}}', methodDeclarations);
    
    if (client.hasInitializationMethod) {
      template = template.replace('{{CONSTRUCTOR_BODY}}', 'this.initializeMethods();');
      template = template.replace('{{INITIALIZATION_METHOD}}', generateInitializationMethod(operations));
    } else {
      template = template.replace('{{CONSTRUCTOR_BODY}}', methodImplementations);
      template = template.replace('{{INITIALIZATION_METHOD}}', '');
    }
  }

  // 5. Write output file
  const outputPath = path.join(__dirname, client.outputPath);
  fs.writeFileSync(outputPath, template);
  
  console.log(`✓ Generated ${client.name} with ${operations.length} operations`);
}

// Main execution
if (require.main === module) {
  CLIENTS.forEach(processClient);
  console.log('\nClient generation complete!');
}