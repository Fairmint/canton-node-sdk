#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

interface ClientConfig {
  name: string;
  clientFile: string;
  operationsDir: string;
  baseClass: string;
  baseClassImportPath?: string;
  configTypeName?: string;
  apiType?: string;
}

const CLIENTS: ClientConfig[] = [
  {
    name: 'ValidatorApiClient',
    clientFile: path.join(__dirname, '../src/clients/validator-api/ValidatorApiClient.generated.ts'),
    operationsDir: path.join(__dirname, '../src/clients/validator-api/operations/v0'),
    baseClass: 'BaseClient',
    apiType: 'VALIDATOR_API',
  },
  {
    name: 'LedgerJsonApiClient',
    clientFile: path.join(__dirname, '../src/clients/ledger-json-api/LedgerJsonApiClient.generated.ts'),
    operationsDir: path.join(__dirname, '../src/clients/ledger-json-api/operations/v2'),
    baseClass: 'BaseClient',
    apiType: 'LEDGER_JSON_API',
  },
  {
    name: 'ScanApiClient',
    clientFile: path.join(__dirname, '../src/clients/scan-api/ScanApiClient.generated.ts'),
    operationsDir: path.join(__dirname, '../src/clients/scan-api/operations'),
    baseClass: 'ScanApiClientBase',
    baseClassImportPath: './ScanApiClientBase',
    configTypeName: 'ScanApiConfig',
  },
];

// Recursively get all .ts files in a directory
function getAllTsFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      results = results.concat(getAllTsFiles(filePath));
    } else if (file.endsWith('.ts')) {
      results.push(filePath);
    }
  });
  return results;
}

type OperationInfo =
  | { kind: 'api'; operationName: string; paramsType: string; responseType: string; methodName?: string }
  | { kind: 'ws'; operationName: string; paramsType: string; requestType: string; messageType: string };

// Extract operation info from a file (supports REST, WebSocket, and class-based operations)
function extractOperationInfo(fileContent: string): OperationInfo | null {
  // REST operations: createApiOperation or createSimpleApiOperation
  const apiRegex = /export const (\w+) = create(?:Simple)?ApiOperation<\s*([^,]+),\s*([^>]+)\s*>/s;
  const apiMatch = apiRegex.exec(fileContent);
  if (apiMatch?.[1] && apiMatch[2] && apiMatch[3]) {
    return {
      kind: 'api',
      operationName: apiMatch[1],
      paramsType: apiMatch[2].trim(),
      responseType: apiMatch[3].trim(),
    };
  }

  // Class-based operations: export class OperationName { ... execute(...) }
  const classRegex = /export class (\w+)[^{]*{[\s\S]*?(?:public\s+)?async (execute|connect)\(/s;
  const classMatch = classRegex.exec(fileContent);
  if (classMatch?.[1]) {
    const methodName = classMatch[2];
    return {
      kind: 'api',
      operationName: classMatch[1],
      paramsType: 'unknown',
      responseType: 'unknown',
      ...(methodName && { methodName }),
    };
  }

  // WebSocket operations
  const wsNameRegex = /export const (\w+)\s*=\s*createWebSocketOperation</s;
  const wsNameMatch = wsNameRegex.exec(fileContent);
  if (wsNameMatch?.[1]) {
    return {
      kind: 'ws',
      operationName: wsNameMatch[1],
      paramsType: 'unknown',
      requestType: 'unknown',
      messageType: 'unknown',
    };
  }

  return null;
}

function relativeImportPath(from: string, to: string): string {
  let rel = path.relative(path.dirname(from), to).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel.replace(/\.ts$/, '');
}

function generateMethodDeclarations(ops: Array<OperationInfo & { importPath: string }>): string {
  return ops
    .map((op) => {
      const methodName = operationNameToMethodName(op.operationName);
      if (op.kind === 'api') {
        const opMethodName = op.methodName ?? 'execute';
        const methodParamsType = `Parameters<InstanceType<typeof ${op.operationName}>['${opMethodName}']>[0]`;
        const methodReturnType = `ReturnType<InstanceType<typeof ${op.operationName}>['${opMethodName}']>`;
        if (op.paramsType === 'void') {
          return `  public ${methodName}!: () => ${methodReturnType};`;
        }
        return `  public ${methodName}!: (params: ${methodParamsType}) => ${methodReturnType};`;
      }
      const paramsType = `Parameters<InstanceType<typeof ${op.operationName}>['subscribe']>[0]`;
      const messageType = `Parameters<Parameters<InstanceType<typeof ${op.operationName}>['subscribe']>[1]['onMessage']>[0]`;
      return `  public ${methodName}!: (params: ${paramsType}, handlers: WebSocketHandlers<${messageType}>) => Promise<WebSocketSubscription>;`;
    })
    .join('\n');
}

function generateMethodImplementations(ops: Array<OperationInfo & { importPath: string }>): string {
  return ops
    .map((op) => {
      const methodName = operationNameToMethodName(op.operationName);
      if (op.kind === 'api') {
        const params = op.paramsType === 'void' ? '' : 'params';
        const opMethodName = op.methodName ?? 'execute';
        return `    this.${methodName} = (${params}) => new ${op.operationName}(this).${opMethodName}(${params});`;
      }
      return `    this.${methodName} = (params, handlers) => new ${op.operationName}(this).subscribe(params as any, handlers as any);`;
    })
    .join('\n');
}

function generateOperationImports(opFiles: Array<{ operationName: string; importPath: string }>): string {
  return opFiles.map((op) => `import { ${op.operationName} } from '${op.importPath}';`).join('\n');
}

function operationNameToMethodName(operationName: string): string {
  return operationName.charAt(0).toLowerCase() + operationName.slice(1);
}

function generateClientFile(config: ClientConfig): void {
  const files = getAllTsFiles(config.operationsDir);

  const allOps = files
    .map((file) => {
      const content = fs.readFileSync(file, 'utf8');
      const info = extractOperationInfo(content);
      if (!info) return null;
      return { ...info, importPath: relativeImportPath(config.clientFile, file) };
    })
    .filter(Boolean) as Array<OperationInfo & { importPath: string }>;

  if (allOps.length === 0) return;

  const methodDecls = generateMethodDeclarations(allOps);
  const methodImpls = generateMethodImplementations(allOps);
  const opImports = generateOperationImports(allOps);

  const baseClassPath = config.baseClassImportPath ?? '../../core';
  const configType = config.configTypeName ?? 'ClientConfig';
  const paramOptional = config.apiType ? '?' : '';
  const superCall = config.apiType ? `super('${config.apiType}', config);` : `super(config);`;

  const needsWsImports = allOps.some((op) => op.kind === 'ws');
  const wsImports = needsWsImports ? `\nimport { WebSocketHandlers, WebSocketSubscription } from '../../core/ws';` : '';

  const content = `import { ${config.baseClass}, ${configType} } from '${baseClassPath}';
${opImports}
${wsImports}

/** Client for interacting with Canton's ${config.name.replace('Client', '')} */
export class ${config.name} extends ${config.baseClass} {
${methodDecls}

  constructor(config${paramOptional}: ${configType}) {
    ${superCall}
    this.initializeMethods();
  }

  private initializeMethods(): void {
${methodImpls}
  }
}
`;

  fs.writeFileSync(config.clientFile, content);
}

function generateAllClients(): void {
  console.log('Generating all client files...');
  CLIENTS.forEach((config) => {
    try {
      generateClientFile(config);
    } catch (error) {
      console.error(`Error generating ${config.name}:`, error);
    }
  });
  console.log('Client generation complete');
}

if (require.main === module) {
  generateAllClients();
}
