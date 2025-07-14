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
  responseSchema?: string;
}

class OperationDocGenerator {
  private operations: OperationInfo[] = [];
  private schemaCache = new Map<string, string>();

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
    };

    // Extract function name and other metadata
    this.extractMetadata(sourceFile, operationInfo);

    if (operationInfo.name && operationInfo.method) {
      // Extract response schema if we have a response type
      if (operationInfo.responseType) {
        operationInfo.responseSchema = await this.extractResponseSchema(
          operationInfo.responseType
        );
      }
      this.operations.push(operationInfo as OperationInfo);
    }
  }

  private extractMetadata(
    sourceFile: ts.SourceFile,
    operationInfo: Partial<OperationInfo>
  ): void {
    const visit = (node: ts.Node): void => {
      // Look for exported constant declarations (function names)
      if (
        ts.isVariableStatement(node) &&
        node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isVariableDeclaration(declaration) && declaration.name) {
            if (ts.isIdentifier(declaration.name)) {
              operationInfo.name = declaration.name.text;
            }
          }
        }
      }

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

  private async extractResponseSchema(responseType: string): Promise<string> {
    // Check cache first
    if (this.schemaCache.has(responseType)) {
      const cached = this.schemaCache.get(responseType);
      if (cached) return cached;
    }

    // Look for the schema in the schemas directory
    const schemasDir = path.join(
      process.cwd(),
      'src/clients/ledger-json-api/schemas'
    );
    const schemaFiles = [
      'api/updates.ts',
      'api/transactions.ts',
      'api/events.ts',
      'api/packages.ts',
      'api/users.ts',
      'api/commands.ts',
      'api/state.ts',
      'api/errors.ts',
      'api/completions.ts',
      'api/event-details.ts',
      'api/reassignment.ts',
      'api/command-responses.ts',
    ];

    for (const schemaFile of schemaFiles) {
      const filePath = path.join(schemasDir, schemaFile);
      if (fs.existsSync(filePath)) {
        const schema = await this.findSchemaInFile(filePath, responseType);
        if (schema) {
          this.schemaCache.set(responseType, schema);
          return schema;
        }
      }
    }

    // If not found, return the type name as fallback
    return `\`${responseType}\``;
  }

  private async findSchemaInFile(
    filePath: string,
    responseType: string
  ): Promise<string | null> {
    const sourceCode = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );

    let schemaDefinition: string | null = null;
    const schemaName = responseType.replace('Response', 'ResponseSchema');

    const visit = (node: ts.Node): void => {
      // Look for schema export that matches the response type
      if (
        ts.isVariableStatement(node) &&
        node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        for (const declaration of node.declarationList.declarations) {
          if (
            ts.isVariableDeclaration(declaration) &&
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === schemaName
          ) {
            // Found the schema, now extract its structure
            console.log(`Found schema ${schemaName} in ${filePath}`);
            schemaDefinition = this.extractSchemaStructure(
              declaration.initializer
            );
            return;
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    if (!schemaDefinition) {
      console.log(`Schema ${schemaName} not found in ${filePath}`);
    }

    return schemaDefinition;
  }

  private extractSchemaStructure(node: ts.Expression | undefined): string {
    if (!node) return '';

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'z.object'
    ) {
      return this.extractZodObjectStructure(node);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'z.array'
    ) {
      return this.extractZodArrayStructure(node);
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'z.union'
    ) {
      return this.extractZodUnionStructure(node);
    }

    return '';
  }

  private extractZodObjectStructure(node: ts.CallExpression): string {
    const arg = node.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) return '';

    const properties: string[] = [];

    for (const prop of arg.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const propName = prop.name.text;
        const propType = this.extractPropertyType(prop.initializer);
        const isOptional =
          propType.endsWith(' | undefined') || propType.endsWith(' | null');
        const cleanType = propType
          .replace(' | undefined', '')
          .replace(' | null', '');

        properties.push(
          `    ${propName}${isOptional ? '?' : ''}: ${cleanType};`
        );
      }
    }

    return `{\n${properties.join('\n')}\n}`;
  }

  private extractZodArrayStructure(node: ts.CallExpression): string {
    const arg = node.arguments[0];
    if (!arg) return 'any[]';

    const elementType = this.extractPropertyType(arg);
    return `${elementType}[]`;
  }

  private extractZodUnionStructure(node: ts.CallExpression): string {
    const arg = node.arguments[0];
    if (!arg || !ts.isArrayLiteralExpression(arg)) return 'any';

    const types = arg.elements.map(element =>
      this.extractPropertyType(element)
    );
    return types.join(' | ');
  }

  private extractPropertyType(node: ts.Expression): string {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression)) {
        switch (node.expression.text) {
          case 'z.string':
            return 'string';
          case 'z.number':
            return 'number';
          case 'z.boolean':
            return 'boolean';
          case 'z.object':
            return this.extractZodObjectStructure(node);
          case 'z.array':
            return this.extractZodArrayStructure(node);
          case 'z.union':
            return this.extractZodUnionStructure(node);
          case 'z.record':
            return 'Record<string, any>';
          case 'z.any':
            return 'any';
          case 'z.null':
            return 'null';
          case 'z.undefined':
            return 'undefined';
          default:
            return 'any';
        }
      }
    } else if (ts.isPropertyAccessExpression(node)) {
      // Handle z.string().optional() or similar
      if (
        ts.isCallExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.name.text === 'optional'
      ) {
        const baseType = this.extractPropertyType(node.expression);
        return `${baseType} | undefined`;
      }
      if (
        ts.isCallExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.name.text === 'nullable'
      ) {
        const baseType = this.extractPropertyType(node.expression);
        return `${baseType} | null`;
      }
    } else if (ts.isIdentifier(node)) {
      // Handle schema references - try to resolve them
      const schemaName = node.text;
      if (schemaName.endsWith('Schema')) {
        // For now, return a simplified type name
        return schemaName.replace('Schema', '');
      }
      return 'any';
    }

    return 'any';
  }

  private detectCategories(): string[] {
    const categories = new Set<string>();

    for (const operation of this.operations) {
      // Extract category from file path
      // Path format: .../operations/v2/category/filename.ts
      const pathParts = operation.filePath.split('/');
      const operationsIndex = pathParts.findIndex(
        part => part === 'operations'
      );

      if (operationsIndex !== -1 && pathParts[operationsIndex + 2]) {
        const category = pathParts[operationsIndex + 2];
        if (category) {
          categories.add(category);
        }
      }
    }

    return Array.from(categories).sort();
  }

  private generateCategorySection(category: string): string {
    const categoryOperations = this.operations.filter(op =>
      op.filePath.includes(`/${category}/`)
    );

    if (categoryOperations.length === 0) {
      return '';
    }

    // Sort operations by function name
    categoryOperations.sort((a, b) => a.name.localeCompare(b.name));

    const categoryName = category.charAt(0).toUpperCase() + category.slice(1);

    return `### ${categoryName}

| Operation | Description |
|-----------|-------------|
${categoryOperations
  .map(
    op =>
      `| [${op.name}](/operations/${op.name}/) | ${op.description || 'No description'} |`
  )
  .join('\n')}`;
  }

  private async generateOperationsIndex(): Promise<void> {
    const frontMatter = `---
layout: default
---

`;

    // Dynamically detect categories from operation file paths
    const categories = this.detectCategories();

    const indexContent =
      frontMatter +
      `# Canton Node SDK Operations

This document provides an overview of all available operations in the Canton Node SDK.

## Operations by Category

${categories.map(category => this.generateCategorySection(category)).join('\n\n')}

`;

    const generatedDir = path.join(process.cwd(), 'docs', '_generated');
    if (!fs.existsSync(generatedDir)) {
      fs.mkdirSync(generatedDir, { recursive: true });
    }
    const indexPath = path.join(generatedDir, 'operations.md');
    fs.writeFileSync(indexPath, indexContent);
    console.log(`📄 Generated operations index: ${indexPath}`);
  }

  private async generateOperationDoc(operation: OperationInfo): Promise<void> {
    const frontMatter = `---
layout: default
---

`;
    const docContent =
      frontMatter +
      `# ${operation.name}

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
${operation.responseSchema || (operation.responseType ? `\`${operation.responseType}\`` : 'Response type information not available')}

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
      '_operations',
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
