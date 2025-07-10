#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

interface OperationInfo {
  name: string;
  filePath: string;
  method: 'GET' | 'POST';
  description?: string;
  examples?: string[];
  parameters?: string[];
  responseType?: string;
}

class OperationDocGenerator {
  private operations: OperationInfo[] = [];

  async generateDocs(): Promise<void> {
    console.log('🔍 Scanning operations directory...');

    const operationsDir = path.join(
      process.cwd(),
      'src/clients/ledger-json-api/operations'
    );
    await this.scanOperations(operationsDir);

    console.log(`📝 Found ${this.operations.length} operations`);

    // Create docs directory
    const docsDir = path.join(process.cwd(), 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Generate main operations index
    await this.generateOperationsIndex();

    // Generate individual operation docs
    for (const operation of this.operations) {
      await this.generateOperationDoc(operation);
    }

    console.log('✅ Documentation generation complete!');
  }

  private async scanOperations(dir: string): Promise<void> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.scanOperations(fullPath);
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.startsWith('index')
      ) {
        await this.extractOperationInfo(fullPath);
      }
    }
  }

  private async extractOperationInfo(filePath: string): Promise<void> {
    const sourceCode = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );

    const operationInfo: Partial<OperationInfo> = {
      filePath,
      name: path.basename(filePath, '.ts'),
    };

    // Extract JSDoc comments and operation metadata
    this.extractMetadata(sourceFile, operationInfo);

    if (operationInfo.name && operationInfo.method) {
      this.operations.push(operationInfo as OperationInfo);
    }
  }

  private extractMetadata(
    sourceFile: ts.SourceFile,
    operationInfo: Partial<OperationInfo>
  ): void {
    const visit = (node: ts.Node): void => {
      // Look for JSDoc comments
      const jsDoc = ts.getJSDocTags(node);
      for (const tag of jsDoc) {
        if (tag.tagName.text === 'description') {
          operationInfo.description = tag.comment
            ? tag.comment.toString().trim()
            : '';
        } else if (tag.tagName.text === 'example') {
          if (!operationInfo.examples) operationInfo.examples = [];
          const exampleText = tag.comment?.toString().trim() || '';
          // Clean up the example text
          const cleanExample = exampleText
            .replace(/```typescript\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
          operationInfo.examples.push(cleanExample);
        } else if (tag.tagName.text === 'param') {
          if (!operationInfo.parameters) operationInfo.parameters = [];
          const paramText = tag.comment?.toString().trim() || '';
          // Only add if not already present
          if (!operationInfo.parameters.includes(paramText)) {
            operationInfo.parameters.push(paramText);
          }
        }
      }

      // Look for createApiOperation calls
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'createApiOperation'
      ) {
        const configArg = node.arguments[0];
        if (configArg && ts.isObjectLiteralExpression(configArg)) {
          for (const prop of configArg.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
              const propName = prop.name.text;

              if (
                propName === 'method' &&
                ts.isStringLiteral(prop.initializer)
              ) {
                operationInfo.method = prop.initializer.text as 'GET' | 'POST';
              }
            }
          }
        }
      }

      // Look for type imports to extract response type
      if (ts.isImportDeclaration(node) && node.importClause) {
        const importPath = (node.moduleSpecifier as ts.StringLiteral).text;
        if (importPath.includes('schemas')) {
          this.extractResponseType(node, operationInfo);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  private extractResponseType(
    node: ts.ImportDeclaration,
    operationInfo: Partial<OperationInfo>
  ): void {
    if (
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const specifier of node.importClause.namedBindings.elements) {
        const name = specifier.name.text;
        if (name.includes('Response')) {
          operationInfo.responseType = name;
        }
      }
    }
  }

  private async generateOperationsIndex(): Promise<void> {
    const indexContent = `# Canton Node SDK Operations

This document provides an overview of all available operations in the Canton Node SDK.

## Available Operations

${this.operations
  .map(op => {
    const docPath = `operations/${op.name}.md`;
    return `- [${op.name}](./${docPath}) - ${op.description || 'No description available'}`;
  })
  .join('\n')}

## Operation Categories

### Events
${this.operations
  .filter(op => op.filePath.includes('/events/'))
  .map(op => `- [${op.name}](./operations/${op.name}.md)`)
  .join('\n')}

### Updates  
${this.operations
  .filter(op => op.filePath.includes('/updates/'))
  .map(op => `- [${op.name}](./operations/${op.name}.md)`)
  .join('\n')}

## Quick Reference

| Operation | Method | Description |
|-----------|--------|-------------|
${this.operations
  .map(
    op =>
      `| [${op.name}](./operations/${op.name}.md) | \`${op.method}\` | ${op.description || 'No description'} |`
  )
  .join('\n')}

---

*Generated automatically from operation definitions*
`;

    const indexPath = path.join(process.cwd(), 'docs', 'operations.md');
    fs.writeFileSync(indexPath, indexContent);
    console.log(`📄 Generated operations index: ${indexPath}`);
  }

  private async generateOperationDoc(operation: OperationInfo): Promise<void> {
    const docContent = `# ${operation.name}

${operation.description ? `## Description\n\n${operation.description}\n\n` : ''}

## Method
\`${operation.method}\`

## Parameters
${
  operation.parameters && operation.parameters.length > 0
    ? operation.parameters.map(param => `- ${param}`).join('\n')
    : 'No additional parameters documented'
}

## Examples
${
  operation.examples && operation.examples.length > 0
    ? operation.examples
        .map(example => `\`\`\`typescript\n${example}\n\`\`\``)
        .join('\n\n')
    : 'No examples available'
}

## Response Type
${operation.responseType ? `\`${operation.responseType}\`` : 'Response type information not available'}

## Usage

\`\`\`typescript
import { CantonNodeClient } from '@fairmint/canton-node-sdk';

const client = new CantonNodeClient({
  apiUrl: 'https://your-canton-node.com',
  partyId: 'your-party-id'
});

${
  operation.examples && operation.examples.length > 0
    ? operation.examples[0]
    : `// Example usage for ${operation.name}`
}
\`\`\`

---

*Generated from: \`${path.relative(process.cwd(), operation.filePath)}\`*
`;

    const docPath = path.join(
      process.cwd(),
      'docs',
      'operations',
      `${operation.name}.md`
    );

    // Ensure operations directory exists
    const operationsDir = path.dirname(docPath);
    if (!fs.existsSync(operationsDir)) {
      fs.mkdirSync(operationsDir, { recursive: true });
    }

    fs.writeFileSync(docPath, docContent);
    console.log(`📄 Generated operation doc: ${docPath}`);
  }
}

// Run the generator
async function main(): Promise<void> {
  try {
    const generator = new OperationDocGenerator();
    await generator.generateDocs();
  } catch (error) {
    console.error('❌ Error generating documentation:', error);
    process.exit(1);
  }
}

main();
