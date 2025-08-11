#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

interface ClientConfig {
  name: string;
  constant: string;
  description: string;
  baseClientClass: string;
  operationsDir: string;
  outputFile: string;
}

interface OperationInfo {
  className: string;
  importPath: string;
  methodName: string;
  paramsType: string;
  responseType: string;
}

const CLIENTS: ClientConfig[] = [
  {
    name: 'LedgerJsonApiClient',
    constant: 'LEDGER_JSON_API',
    description: "Canton's Ledger JSON API",
    baseClientClass: 'BaseClient',
    operationsDir: 'src/clients/ledger-json-api/operations',
    outputFile: 'src/clients/ledger-json-api/LedgerJsonApiClient.generated.ts'
  },
  {
    name: 'ValidatorApiClient',
    constant: 'VALIDATOR_API',
    description: "Canton's Validator API",
    baseClientClass: 'BaseClient',
    operationsDir: 'src/clients/validator-api/operations',
    outputFile: 'src/clients/validator-api/ValidatorApiClient.generated.ts'
  },
  {
    name: 'LighthouseApiClient',
    constant: 'LIGHTHOUSE_API',
    description: 'Lighthouse API',
    baseClientClass: 'SimpleBaseClient',
    operationsDir: 'src/clients/lighthouse-api/operations',
    outputFile: 'src/clients/lighthouse-api/LighthouseApiClient.generated.ts'
  }
];

function findOperations(operationsDir: string): OperationInfo[] {
  const operations: OperationInfo[] = [];
  
  // Find all TypeScript files in the operations directory
  const pattern = path.join(operationsDir, '**/*.ts');
  const files = glob.sync(pattern);
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    
    // Look for createApiOperation calls to identify operations
    const createApiOperationMatch = content.match(/createApiOperation\s*\(\s*['"`]([^'"`]+)['"`]/);
    if (createApiOperationMatch) {
      const operationName = createApiOperationMatch[1];
      
      // Extract class name from the file
      const classNameMatch = content.match(/export\s+class\s+(\w+)/);
      if (classNameMatch) {
        const className = classNameMatch[1];
        
        // Generate method name from operation name
        const methodName = operationName
          .replace(/^get-/, 'get')
          .replace(/^create-/, 'create')
          .replace(/^update-/, 'update')
          .replace(/^delete-/, 'delete')
          .replace(/^list-/, 'list')
          .replace(/^submit-/, 'submit')
          .replace(/^upload-/, 'upload')
          .replace(/^allocate-/, 'allocate')
          .replace(/^grant-/, 'grant')
          .replace(/^revoke-/, 'revoke')
          .replace(/^lookup-/, 'lookup')
          .replace(/^buy-/, 'buy')
          .replace(/^accept-/, 'accept')
          .replace(/^reject-/, 'reject')
          .replace(/^withdraw-/, 'withdraw')
          .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        
        // Generate import path relative to the client directory
        const relativePath = path.relative(path.dirname(path.dirname(file)), file).replace(/\.ts$/, '');
        const importPath = `./${relativePath}`;
        
        // Generate type names
        const paramsType = `${className}Params`;
        const responseType = `${className}Response`;
        
        operations.push({
          className,
          importPath,
          methodName,
          paramsType,
          responseType
        });
      }
    }
  }
  
  return operations;
}

function generateClientFile(client: ClientConfig, operations: OperationInfo[]): string {
  const template = fs.readFileSync('src/clients/templates/ClientTemplate.mustache', 'utf-8');
  
  // Generate operation imports
  const operationImports = operations
    .map(op => `import { ${op.className} } from '${op.importPath}';`)
    .join('\n');
  
  // Generate type imports
  const typeImports = operations
    .map(op => `import type { ${op.paramsType}, ${op.responseType} } from '${op.importPath}';`)
    .join('\n');
  
  // Generate method declarations
  const methodDeclarations = operations
    .map(op => `  public ${op.methodName}!: (params: ${op.paramsType}) => Promise<${op.responseType}>;`)
    .join('\n');
  
  // Generate method implementations
  const methodImplementations = operations
    .map(op => `    this.${op.methodName} = (params) => new ${op.className}(this).execute(params);`)
    .join('\n');
  
  // Replace template placeholders
  return template
    .replace(/\{\{baseClientClass\}\}/g, client.baseClientClass)
    .replace(/\{\{operationImports\}\}/g, operationImports)
    .replace(/\{\{typeImports\}\}/g, typeImports)
    .replace(/\{\{clientDescription\}\}/g, client.description)
    .replace(/\{\{clientClassName\}\}/g, client.name)
    .replace(/\{\{clientConstant\}\}/g, client.constant)
    .replace(/\{\{methodDeclarations\}\}/g, methodDeclarations)
    .replace(/\{\{methodImplementations\}\}/g, methodImplementations);
}

function main() {
  console.log('Generating client files...');
  
  for (const client of CLIENTS) {
    console.log(`Processing ${client.name}...`);
    
    try {
      const operations = findOperations(client.operationsDir);
      console.log(`  Found ${operations.length} operations`);
      
      const generatedContent = generateClientFile(client, operations);
      
      // Ensure output directory exists
      const outputDir = path.dirname(client.outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Write generated file
      fs.writeFileSync(client.outputFile, generatedContent);
      console.log(`  Generated ${client.outputFile}`);
      
    } catch (error) {
      console.error(`  Error processing ${client.name}:`, error);
    }
  }
  
  console.log('Client generation complete!');
}

if (require.main === module) {
  main();
}
