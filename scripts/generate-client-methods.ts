#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

const CLIENT_FILE = path.join(
  __dirname,
  '../src/clients/ledger-json-api/LedgerJsonApiClient.ts'
);
const OPERATIONS_DIR = path.join(
  __dirname,
  '../src/clients/ledger-json-api/operations/v2'
);
const SCHEMAS_IMPORT_PATH = '../schemas';

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
  // Handles multiline exports with type parameters on separate lines
  const regex =
    /export const (\w+) = createApiOperation<\s*([\w]+),\s*([\w]+)\s*>/s;
  const match = regex.exec(fileContent);
  if (!match || !match[1] || !match[2] || !match[3]) return null;

  return {
    operationName: match[1],
    paramsType: match[2],
    responseType: match[3],
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
      return `  public ${methodName}!: (params: ${op.paramsType}) => Promise<${op.responseType}>;`;
    })
    .join('\n');
}

function generateMethodImplementations(
  ops: { operationName: string; paramsType: string; responseType: string }[]
): string {
  return ops
    .map(op => {
      const methodName = operationNameToMethodName(op.operationName);
      return `    this.${methodName} = (params) => new ${op.operationName}(this).execute(params);`;
    })
    .join('\n');
}

function generateImports(
  ops: { paramsType: string; responseType: string }[]
): string {
  // Collect all unique types
  const types = new Set<string>();
  ops.forEach(op => {
    types.add(op.paramsType);
    types.add(op.responseType);
  });
  return `import { ${Array.from(types).sort().join(', ')} } from '${SCHEMAS_IMPORT_PATH}';`;
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

function updateClientFile(): void {
  // 1. Scan all operation files
  const files = getAllTsFiles(OPERATIONS_DIR);

  const allOps = files
    .map(file => {
      const content = fs.readFileSync(file, 'utf8');
      const info = extractOperationInfo(content);
      if (!info) return null;
      return {
        ...info,
        importPath: relativeImportPath(CLIENT_FILE, file),
      };
    })
    .filter(Boolean) as {
    operationName: string;
    paramsType: string;
    responseType: string;
    importPath: string;
  }[];

  // 2. Generate method declarations, implementations, and imports
  const methodDecls = generateMethodDeclarations(allOps);
  const methodImpls = generateMethodImplementations(allOps);
  const importDecl = generateImports(allOps);
  const opImports = generateOperationImports(allOps);

  // 3. Read the client file
  let content = fs.readFileSync(CLIENT_FILE, 'utf8');

  // 4. Replace the import line for schemas
  content = content.replace(
    /import \{[^}]+\} from '\.\.\/schemas';/,
    importDecl
  );

  // 5. Replace the codegen marker sections
  content = content.replace(
    /(\/\/ AUTO-GENERATED OPERATION IMPORTS START)([\s\S]*?)(\/\/ AUTO-GENERATED OPERATION IMPORTS END)/,
    `$1\n${opImports}\n$3`
  );
  content = content.replace(
    /(\/\/ AUTO-GENERATED METHOD IMPLEMENTATIONS START)([\s\S]*?)(\/\/ AUTO-GENERATED METHOD IMPLEMENTATIONS END)/,
    `$1\n${methodImpls}\n    $3`
  );
  content = content.replace(
    /(\/\/ AUTO-GENERATED METHODS START)([\s\S]*?)(\/\/ AUTO-GENERATED METHODS END)/,
    `$1\n${methodDecls}\n  $3`
  );

  fs.writeFileSync(CLIENT_FILE, content);
}

if (require.main === module) {
  updateClientFile();
}
