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
    clientFile: path.join(__dirname, '../src/clients/validator-api/ValidatorApiClient.generated.ts'),
    operationsDir: path.join(__dirname, '../src/clients/validator-api/operations/v0'),
    baseClass: 'BaseClient',
  },
  {
    name: 'LedgerJsonApiClient',
    clientFile: path.join(__dirname, '../src/clients/ledger-json-api/LedgerJsonApiClient.generated.ts'),
    operationsDir: path.join(__dirname, '../src/clients/ledger-json-api/operations/v2'),
    baseClass: 'BaseClient',
  },
  {
    name: 'ScanApiClient',
    clientFile: path.join(__dirname, '../src/clients/scan-api/ScanApiClient.generated.ts'),
    operationsDir: path.join(__dirname, '../src/clients/scan-api/operations/v0'),
    baseClass: 'BaseClient',
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
  | { kind: 'api'; operationName: string; paramsType: string; responseType: string; methodName?: string | undefined; jsdoc?: string | undefined }
  | { kind: 'ws'; operationName: string; paramsType: string; requestType: string; messageType: string; jsdoc?: string | undefined };

/**
 * Extracts JSDoc comment that directly precedes an export declaration (no code between them)
 */
function extractJsDoc(fileContent: string, operationName: string): string | undefined {
  // Match JSDoc comment that is immediately before export const/class (only whitespace allowed between)
  // Must not have any code between the JSDoc closing */ and the export
  const jsdocRegex = new RegExp(
    `(/\\*\\*(?:(?!\\*/).)*.?\\*/)\\s*\\nexport (?:const|class) ${operationName}\\b`,
    's'
  );
  const match = jsdocRegex.exec(fileContent);
  const jsdoc = match?.[1];

  // Validate it's actually a JSDoc (starts with /** and ends with */)
  if (jsdoc && jsdoc.startsWith('/**') && jsdoc.includes('*/')) {
    // Make sure it doesn't contain code-like patterns that indicate it's not a pure JSDoc
    if (jsdoc.includes('z.string()') || jsdoc.includes('z.object(')) {
      return undefined;
    }
    return jsdoc;
  }
  return undefined;
}

/**
 * Generate a human-readable description from an operation name
 */
function generateDescriptionFromName(operationName: string): string {
  // Split camelCase/PascalCase into words
  const words = operationName
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase()
    .split(' ');

  // Handle common prefixes
  const prefix = words[0];
  const rest = words.slice(1).join(' ');

  if (prefix === 'get') return `Gets ${rest}`;
  if (prefix === 'list') return `Lists ${rest}`;
  if (prefix === 'create') return `Creates ${rest}`;
  if (prefix === 'delete') return `Deletes ${rest}`;
  if (prefix === 'update') return `Updates ${rest}`;
  if (prefix === 'submit') return `Submits ${rest}`;
  if (prefix === 'subscribe') return `Subscribes to ${rest}`;
  if (prefix === 'allocate') return `Allocates ${rest}`;
  if (prefix === 'lookup') return `Looks up ${rest}`;
  if (prefix === 'revoke') return `Revokes ${rest}`;
  if (prefix === 'grant') return `Grants ${rest}`;

  // Default: just capitalize first letter
  return operationName.charAt(0).toUpperCase() + operationName.slice(1).replace(/([A-Z])/g, ' $1').trim();
}

// Extract operation info from a file (supports REST, WebSocket, and class-based operations)
function extractOperationInfos(fileContent: string): OperationInfo[] {
  const results: OperationInfo[] = [];

  // REST operations: createApiOperation or createSimpleApiOperation
  const apiRegex = /export const (\w+)\s*=\s*create(?:Simple)?ApiOperation<\s*([^,]+),\s*([^>]+)\s*>/gs;
  for (const match of fileContent.matchAll(apiRegex)) {
    const operationName = match[1];
    const paramsType = match[2];
    const responseType = match[3];
    if (operationName && paramsType && responseType) {
      results.push({
        kind: 'api',
        operationName,
        paramsType: paramsType.trim(),
        responseType: responseType.trim(),
        jsdoc: extractJsDoc(fileContent, operationName),
      });
    }
  }

  // Class-based operations: export class OperationName { ... execute(...) }
  const classRegex = /export class (\w+)[^{]*{[\s\S]*?public async (execute|connect)\(/s;
  const classMatch = classRegex.exec(fileContent);
  if (classMatch?.[1]) {
    const methodName = classMatch[2]; // 'execute' or 'connect'
    results.push({
      kind: 'api',
      operationName: classMatch[1],
      paramsType: 'unknown',
      responseType: 'unknown',
      ...(methodName && { methodName }), // Only include if defined
      jsdoc: extractJsDoc(fileContent, classMatch[1]),
    });
  }

  // WebSocket operations: createWebSocketOperation<Params, RequestMessage, InboundMessage>
  // Note: Generic types can contain nested angle brackets (e.g., z.infer<...>),
  // which are hard to parse reliably with a simple regex. We only need the
  // operation name for generation, so match by name and ignore generic details.
  const wsNameRegex = /export const (\w+)\s*=\s*createWebSocketOperation</s;
  const wsNameMatch = wsNameRegex.exec(fileContent);
  if (wsNameMatch?.[1]) {
    results.push({
      kind: 'ws',
      operationName: wsNameMatch[1],
      paramsType: 'unknown',
      requestType: 'unknown',
      messageType: 'unknown',
      jsdoc: extractJsDoc(fileContent, wsNameMatch[1]),
    });
  }

  return results;
}

function relativeImportPath(from: string, to: string): string {
  let rel = path.relative(path.dirname(from), to).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel.replace(/\.ts$/, '');
}

/**
 * Extract the first line of a JSDoc comment (the description)
 */
function extractJsDocDescription(jsdoc: string | undefined): string | undefined {
  if (!jsdoc) return undefined;

  // Remove /** and */ and trim
  const content = jsdoc
    .replace(/^\/\*\*\s*/s, '')
    .replace(/\s*\*\/$/s, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, ''))
    .join('\n')
    .trim();

  // Get first paragraph (up to first blank line or @tag)
  const firstParagraph = content.split(/\n\s*\n|\n\s*@/)[0];
  return firstParagraph?.trim();
}

function generateMethodDeclarations(ops: Array<OperationInfo & { importPath: string }>): string {
  return ops
    .map((op) => {
      const methodName = operationNameToMethodName(op.operationName);
      const description = extractJsDocDescription(op.jsdoc) ?? generateDescriptionFromName(op.operationName);

      // Generate JSDoc for the method
      const jsdocComment = `  /** ${description} */`;

      if (op.kind === 'api') {
        const opMethodName = op.methodName ?? 'execute';
        const methodParamsType = `Parameters<InstanceType<typeof ${op.operationName}>['${opMethodName}']>[0]`;
        const methodReturnType = `ReturnType<InstanceType<typeof ${op.operationName}>['${opMethodName}']>`;
        if (op.paramsType === 'void') {
          return `${jsdocComment}\n  public ${methodName}!: () => ${methodReturnType};`;
        }
        return `${jsdocComment}\n  public ${methodName}!: (params: ${methodParamsType}) => ${methodReturnType};`;
      }
      // WebSocket subscribe methods
      const paramsType = `Parameters<InstanceType<typeof ${op.operationName}>['subscribe']>[0]`;
      const messageType = `Parameters<Parameters<InstanceType<typeof ${op.operationName}>['subscribe']>[1]['onMessage']>[0]`;
      return `${jsdocComment}\n  public ${methodName}!: (params: ${paramsType}, handlers: WebSocketHandlers<${messageType}>) => Promise<WebSocketSubscription>;`;
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

// Convert operation name to method name (e.g., GetEventsByContractId -> getEventsByContractId)
function operationNameToMethodName(operationName: string): string {
  return operationName.charAt(0).toLowerCase() + operationName.slice(1);
}

function generateClientFile(clientConfig: ClientConfig): void {
  const { name, clientFile, operationsDir, baseClass } = clientConfig;

  // 1. Scan all operation files
  const files = getAllTsFiles(operationsDir);

  const allOps = files
    .map((file) => {
      const content = fs.readFileSync(file, 'utf8');
      return {
        infos: extractOperationInfos(content),
        importPath: relativeImportPath(clientFile, file),
      };
    })
    .flatMap((item) => item.infos.map((info) => ({ ...info, importPath: item.importPath })));

  if (allOps.length === 0) {
    return;
  }

  // 2. Generate method declarations, implementations, and imports
  const methodDecls = generateMethodDeclarations(allOps);
  const methodImpls = generateMethodImplementations(allOps);
  const opImports = generateOperationImports(allOps);

  // 3. Generate the complete client file content
  const baseClassImport = baseClass === 'SimpleBaseClient' ? 'SimpleBaseClient' : 'BaseClient';
  const baseClassPath = baseClass === 'SimpleBaseClient' ? '../../core' : '../../core';

  // Fix API type for ledger client
  const apiType =
    name === 'LedgerJsonApiClient'
      ? 'LEDGER_JSON_API'
      : name === 'ValidatorApiClient'
        ? 'VALIDATOR_API'
        : name === 'ScanApiClient'
          ? 'SCAN_API'
          : undefined;

  const needsWsImports = allOps.some((op) => op.kind === 'ws');
  const wsImports = needsWsImports ? `\nimport { WebSocketHandlers, WebSocketSubscription } from '../../core/ws';` : '';

  const content = `import { ${baseClassImport}, ClientConfig } from '${baseClassPath}';
${opImports}
${wsImports}

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
}

function generateAllClients(): void {
  console.log('Generating all client files...');

  CLIENTS.forEach((clientConfig) => {
    try {
      generateClientFile(clientConfig);
    } catch (_error) {
      console.error(`Error generating ${clientConfig.name}:`, _error);
    }
  });

  console.log('Client generation complete');
}

if (require.main === module) {
  generateAllClients();
}
