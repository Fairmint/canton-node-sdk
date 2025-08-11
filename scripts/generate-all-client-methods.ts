#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

interface ClientConfig {
  name: string;
  clientFile: string;
  operationsDir: string;
  baseClass: string;
}

const CLIENTS: ClientConfig[] = [
  {
    name: 'ValidatorApiClient',
    clientFile: path.join(
      __dirname,
      '../src/clients/validator-api/ValidatorApiClient.generated.ts'
    ),
    operationsDir: path.join(
      __dirname,
      '../src/clients/validator-api/operations/v0'
    ),
    baseClass: 'BaseClient',
  },
  {
    name: 'LedgerJsonApiClient',
    clientFile: path.join(
      __dirname,
      '../src/clients/ledger-json-api/LedgerJsonApiClient.generated.ts'
    ),
    operationsDir: path.join(
      __dirname,
      '../src/clients/ledger-json-api/operations/v2'
    ),
    baseClass: 'BaseClient',
  },
  {
    name: 'LighthouseApiClient',
    clientFile: path.join(
      __dirname,
      '../src/clients/lighthouse-api/LighthouseApiClient.generated.ts'
    ),
    operationsDir: path.join(
      __dirname,
      '../src/clients/lighthouse-api/operations'
    ),
    baseClass: 'SimpleBaseClient',
  },
];

// Recursively get all .ts files in a directory
function getAllTsFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllTsFiles(filePath));
    } else if (file.endsWith('.ts')) {
      results.push(filePath);
    }
  });
  return results;
}

// Extract operation info from a file
function extractOperationInfo(
  fileContent: string
): { operationName: string; paramsType: string; responseType: string } | null {
  // Matches: export const OperationName = createApiOperation<Params, Response>({...})
  // or export const OperationName = createSimpleApiOperation<Params, Response>({...})
  // Handles multiline exports with type parameters on separate lines
  const regex =
    /export const (\w+) = create(?:Simple)?ApiOperation<\s*([^,]+),\s*([^>]+)\s*>/s;
  const match = regex.exec(fileContent);
  if (!match || !match[1] || !match[2] || !match[3]) return null;

  return {
    operationName: match[1],
    paramsType: match[2].trim(),
    responseType: match[3].trim(),
  };
}

function relativeImportPath(from: string, to: string): string {
  let rel = path.relative(path.dirname(from), to).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel.replace(/\.ts$/, '');
}

function generateMethodDeclarations(
  ops: { operationName: string; paramsType: string; responseType: string }[]
): string {
  return ops
    .map(op => {
      const methodName = operationNameToMethodName(op.operationName);
      const paramsType = op.paramsType === 'void' ? 'void' : 'any';
      return `  public ${methodName}!: (params: ${paramsType}) => Promise<any>;`;
    })
    .join('\n');
}

function generateMethodImplementations(
  ops: { operationName: string; paramsType: string; responseType: string }[]
): string {
  return ops
    .map(op => {
      const methodName = operationNameToMethodName(op.operationName);
      const params = op.paramsType === 'void' ? '' : 'params';
      return `    this.${methodName} = (${params}) => new ${op.operationName}(this).execute(${params});`;
    })
    .join('\n');
}

function generateOperationImports(
  opFiles: { operationName: string; importPath: string }[]
): string {
  return opFiles
    .map(op => `import { ${op.operationName} } from '${op.importPath}';`)
    .join('\n');
}

// Convert operation name to method name (e.g., GetEventsByContractId -> getEventsByContractId)
function operationNameToMethodName(operationName: string): string {
  return operationName.charAt(0).toLowerCase() + operationName.slice(1);
}

function generateClientFile(clientConfig: ClientConfig): void {
  const { name, clientFile, operationsDir, baseClass } = clientConfig;

  // 1. Scan all operation files
  const files = getAllTsFiles(operationsDir);

  const allOps = files
    .map(file => {
      const content = fs.readFileSync(file, 'utf8');
      const info = extractOperationInfo(content);
      if (!info) return null;
      return {
        ...info,
        importPath: relativeImportPath(clientFile, file),
      };
    })
    .filter(Boolean) as {
    operationName: string;
    paramsType: string;
    responseType: string;
    importPath: string;
  }[];

  if (allOps.length === 0) {
    console.warn(`No operations found for ${name} in ${operationsDir}`);
    return;
  }

  // 2. Generate method declarations, implementations, and imports
  const methodDecls = generateMethodDeclarations(allOps);
  const methodImpls = generateMethodImplementations(allOps);
  const opImports = generateOperationImports(allOps);

  // 3. Generate the complete client file content
  const baseClassImport =
    baseClass === 'SimpleBaseClient' ? 'SimpleBaseClient' : 'BaseClient';
  const baseClassPath =
    baseClass === 'SimpleBaseClient' ? '../../core' : '../../core';

  // Fix API type for ledger client
  const apiType =
    name === 'LedgerJsonApiClient'
      ? 'LEDGER_JSON_API'
      : name === 'ValidatorApiClient'
        ? 'VALIDATOR_API'
        : 'LIGHTHOUSE_API';

  const content = `import { ${baseClassImport}, ClientConfig } from '${baseClassPath}';
${opImports}

/** Client for interacting with Canton's ${name.replace('Client', '')} */
export class ${name} extends ${baseClass} {
${methodDecls}

  constructor(clientConfig?: ClientConfig) {
    super('${apiType}', clientConfig);
    this.initializeMethods();
  }

  private initializeMethods(): void {
${methodImpls}
  }
}
`;

  // 4. Write the generated file
  fs.writeFileSync(clientFile, content);
  console.log(`Generated ${name} with ${allOps.length} operations`);
}

function generateAllClients(): void {
  console.log('Generating all client files...');

  CLIENTS.forEach(clientConfig => {
    try {
      generateClientFile(clientConfig);
    } catch (error) {
      console.error(`Error generating ${clientConfig.name}:`, error);
    }
  });

  console.log('Client generation complete!');
}

if (require.main === module) {
  generateAllClients();
}
