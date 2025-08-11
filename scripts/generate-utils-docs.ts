#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

interface UtilFunctionInfo {
  name: string;
  filePath: string;
  description?: string;
  parameters?: string;
  returnType?: string;
  examples?: string[];
  category: string;
  exports: string[];
}

class UtilsDocGenerator {
  private utils: UtilFunctionInfo[] = [];
  private sdkVersion: string;
  private githubRepo = 'https://github.com/Fairmint/canton-node-sdk';

  constructor() {
    // Read SDK version from package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    this.sdkVersion = packageJson.version;
  }

  async generateDocs(): Promise<void> {
    console.log('🔍 Scanning utils directories...');

    // Scan utils directory
    const utilsDir = path.join(process.cwd(), 'src/utils');
    await this.scanUtils(utilsDir);

    console.log(`📝 Found ${this.utils.length} utility functions`);

    // Create docs directory
    const docsDir = path.join(process.cwd(), 'docs');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Generate main utils index
    await this.generateUtilsIndex();

    // Generate individual util category docs
    await this.generateCategoryDocs();

    console.log('✅ Utils documentation generation complete!');
  }

  private async scanUtils(dir: string): Promise<void> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // This is a category directory
        await this.scanUtilsCategory(fullPath, entry.name);
      }
    }
  }

  private async scanUtilsCategory(
    dir: string,
    category: string
  ): Promise<void> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.startsWith('index')
      ) {
        await this.extractUtilInfo(fullPath, category);
      }
    }
  }

  private async extractUtilInfo(
    filePath: string,
    category: string
  ): Promise<void> {
    const sourceCode = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );

    const utilInfo: Partial<UtilFunctionInfo> = {
      name: path.basename(filePath, '.ts'),
      filePath,
      category,
      exports: [],
    };

    this.extractMetadata(sourceFile, utilInfo);
    this.extractExports(sourceFile, utilInfo);

    if (utilInfo.exports && utilInfo.exports.length > 0) {
      this.utils.push(utilInfo as UtilFunctionInfo);
    }
  }

  private extractMetadata(
    sourceFile: ts.SourceFile,
    utilInfo: Partial<UtilFunctionInfo>
  ): void {
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        // Extract function description from JSDoc
        const nodeWithJsDoc = node as ts.Node & { jsDoc?: ts.JSDoc[] };
        if (nodeWithJsDoc.jsDoc && nodeWithJsDoc.jsDoc.length > 0) {
          const jsDoc = nodeWithJsDoc.jsDoc[0];
          if (jsDoc && jsDoc.comment) {
            const comment =
              typeof jsDoc.comment === 'string'
                ? jsDoc.comment
                : jsDoc.comment.map((c: ts.JSDocComment) => c.text).join('');
            utilInfo.description = comment.trim();
          }
        }

        // Extract parameters
        if (node.parameters.length > 0) {
          const params = node.parameters.map(param => {
            const paramName = param.name.getText(sourceFile);
            const paramType = param.type
              ? param.type.getText(sourceFile)
              : 'any';
            const isOptional = param.questionToken ? '?' : '';
            return `${paramName}${isOptional}: ${paramType}`;
          });
          utilInfo.parameters = params.join(', ');
        }

        // Extract return type
        if (node.type) {
          utilInfo.returnType = node.type.getText(sourceFile);
        }
      } else if (
        ts.isExportAssignment(node) &&
        ts.isFunctionExpression(node.expression)
      ) {
        // Handle exported function expressions
        if (node.expression.parameters.length > 0) {
          const params = node.expression.parameters.map(param => {
            const paramName = param.name.getText(sourceFile);
            const paramType = param.type
              ? param.type.getText(sourceFile)
              : 'any';
            const isOptional = param.questionToken ? '?' : '';
            return `${paramName}${isOptional}: ${paramType}`;
          });
          utilInfo.parameters = params.join(', ');
        }

        if (node.expression.type) {
          utilInfo.returnType = node.expression.type.getText(sourceFile);
        }
      } else if (
        ts.isVariableStatement(node) &&
        node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        // Handle exported variables (like function constants)
        node.declarationList.declarations.forEach(decl => {
          if (decl.initializer && ts.isFunctionExpression(decl.initializer)) {
            const func = decl.initializer;
            if (func.parameters.length > 0) {
              const params = func.parameters.map(param => {
                const paramName = param.name.getText(sourceFile);
                const paramType = param.type
                  ? param.type.getText(sourceFile)
                  : 'any';
                const isOptional = param.questionToken ? '?' : '';
                return `${paramName}${isOptional}: ${paramType}`;
              });
              utilInfo.parameters = params.join(', ');
            }

            if (func.type) {
              utilInfo.returnType = func.type.getText(sourceFile);
            }
          }
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  private extractExports(
    sourceFile: ts.SourceFile,
    utilInfo: Partial<UtilFunctionInfo>
  ): void {
    const visit = (node: ts.Node): void => {
      if (ts.isExportDeclaration(node)) {
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          node.exportClause.elements.forEach(element => {
            utilInfo.exports!.push(element.name.text);
          });
        }
      } else if (
        ts.isFunctionDeclaration(node) &&
        node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        if (node.name) {
          utilInfo.exports!.push(node.name.text);
        }
      } else if (
        ts.isVariableStatement(node) &&
        node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        node.declarationList.declarations.forEach(decl => {
          if (decl.name) {
            utilInfo.exports!.push(decl.name.getText(sourceFile));
          }
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  private async generateUtilsIndex(): Promise<void> {
    const content = `---
layout: default
title: Utility Functions - Canton Node SDK
sdk_version: ${this.sdkVersion}
---

# Utility Functions

The Canton Node SDK provides a comprehensive set of utility functions to simplify common blockchain operations.

## Categories

${this.generateCategoryLinks()}

## Overview

This documentation covers all utility functions available in the SDK, organized by category:

- **Amulet Utilities** - Functions for working with Amulet tokens and transfers
- **Contract Utilities** - Tools for contract monitoring and management
- **Mining Utilities** - Functions for mining operations and round management
- **Party Utilities** - Tools for party creation and management
- **Parser Utilities** - Functions for parsing and analyzing blockchain data

## Quick Examples

### Creating a Party

\`\`\`typescript
import { createParty } from '@fairmint/canton-node-sdk';

const result = await createParty({
  network: 'devnet',
  provider: '5n',
  partyName: 'Alice',
  amount: '100.0'
});

console.log(\`Party created with ID: \${result.partyId}\`);
\`\`\`

### Creating Transfer Offers

\`\`\`typescript
import { createTransferOffer } from '@fairmint/canton-node-sdk';

const offerId = await createTransferOffer({
  ledgerClient,
  receiverPartyId: 'Bob::1221',
  amount: '50.0',
  description: 'Payment for services'
});
\`\`\`

### Parsing Fees

\`\`\`typescript
import { parseFeesFromEventTree } from '@fairmint/canton-node-sdk';

const feeAnalysis = parseFeesFromEventTree(eventTree);
console.log(\`Total fees: \${feeAnalysis.totalFees}\`);
\`\`\`

---

_Generated from [${this.githubRepo}](https://github.com/Fairmint/canton-node-sdk) v${this.sdkVersion}_
`;

    const outputPath = path.join(process.cwd(), 'docs/utils.md');
    fs.writeFileSync(outputPath, content);
    console.log(`📝 Generated utils index: ${outputPath}`);
  }

  private generateCategoryLinks(): string {
    const categories = [...new Set(this.utils.map(u => u.category))];

    return categories
      .map(category => {
        const categoryUtils = this.utils.filter(u => u.category === category);
        const count = categoryUtils.length;

        return `- **[${this.capitalizeFirst(category)} Utilities](/utils/${category}/)** - ${count} function${count !== 1 ? 's' : ''}`;
      })
      .join('\n');
  }

  private async generateCategoryDocs(): Promise<void> {
    const categories = [...new Set(this.utils.map(u => u.category))];

    for (const category of categories) {
      await this.generateCategoryDoc(category);
    }
  }

  private async generateCategoryDoc(category: string): Promise<void> {
    const categoryUtils = this.utils.filter(u => u.category === category);

    const content = `---
layout: default
title: ${this.capitalizeFirst(category)} Utilities - Canton Node SDK
sdk_version: ${this.sdkVersion}
---

# ${this.capitalizeFirst(category)} Utilities

${this.getCategoryDescription(category)}

## Functions

${categoryUtils.map(util => this.generateUtilFunctionDoc(util)).join('\n\n')}

---

_Generated from [${this.githubRepo}](https://github.com/Fairmint/canton-node-sdk) v${this.sdkVersion}_

[← Back to Utils Overview](/utils/)
`;

    const outputDir = path.join(process.cwd(), 'docs', 'utils');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `${category}.md`);
    fs.writeFileSync(outputPath, content);
    console.log(`📝 Generated ${category} utils doc: ${outputPath}`);
  }

  private generateUtilFunctionDoc(util: UtilFunctionInfo): string {
    let doc = `### ${util.name}`;

    if (util.description) {
      doc += `\n\n${util.description}`;
    }

    if (util.parameters) {
      doc += `\n\n**Parameters:** \`${util.parameters}\``;
    }

    if (util.returnType) {
      doc += `\n\n**Returns:** \`${util.returnType}\``;
    }

    if (util.exports.length > 0) {
      doc += `\n\n**Exports:** ${util.exports.map(exp => `\`${exp}\``).join(', ')}`;
    }

    // Add example usage
    doc += `\n\n**Example:**\n\`\`\`typescript\nimport { ${util.exports[0] || util.name} } from '@fairmint/canton-node-sdk';\n\n// TODO: Add example usage\n\`\`\``;

    return doc;
  }

  private getCategoryDescription(category: string): string {
    const descriptions: Record<string, string> = {
      amulet:
        'Functions for working with Amulet tokens, including transfer offers, pre-approvals, and token management.',
      contracts:
        'Tools for contract monitoring, disclosure management, and contract lifecycle operations.',
      mining:
        'Functions for mining operations, round management, and mining-related data processing.',
      party:
        'Utilities for party creation, management, and party-related operations.',
      parsers:
        'Functions for parsing and analyzing blockchain data, including fee analysis and data extraction.',
    };

    return (
      descriptions[category] || `Utility functions for ${category} operations.`
    );
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

async function main(): Promise<void> {
  try {
    const generator = new UtilsDocGenerator();
    await generator.generateDocs();
  } catch (error) {
    console.error('❌ Error generating utils documentation:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
