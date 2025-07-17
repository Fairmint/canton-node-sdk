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
  apiType: 'ledger-json-api' | 'validator-api';
}

class OperationDocGenerator {
  private operations: OperationInfo[] = [];
  private schemaCache = new Map<string, string>();
  private sdkVersion: string;

  constructor() {
    // Read SDK version from package.json
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    this.sdkVersion = packageJson.version;
  }

  async generateDocs(): Promise<void> {
    console.log('🔍 Scanning operations directories...');

    // Scan ledger-json-api operations
    const ledgerOperationsDir = path.join(
      process.cwd(),
      'src/clients/ledger-json-api/operations'
    );
    await this.scanOperations(ledgerOperationsDir, 'ledger-json-api');

    // Scan validator-api operations
    const validatorOperationsDir = path.join(
      process.cwd(),
      'src/clients/validator-api/operations'
    );
    await this.scanOperations(validatorOperationsDir, 'validator-api');

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

  private async scanOperations(
    dir: string,
    apiType: 'ledger-json-api' | 'validator-api'
  ): Promise<void> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.scanOperations(fullPath, apiType);
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.startsWith('index')
      ) {
        await this.extractOperationInfo(fullPath, apiType);
      }
    }
  }

  private async extractOperationInfo(
    filePath: string,
    apiType: 'ledger-json-api' | 'validator-api'
  ): Promise<void> {
    const sourceCode = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );

    const operationInfo: Partial<OperationInfo> = {
      filePath,
      apiType,
    };

    // Extract function name and other metadata
    this.extractMetadata(sourceFile, operationInfo);

    if (operationInfo.name && operationInfo.method && operationInfo.apiType) {
      // Extract response schema if we have a response type
      if (operationInfo.responseType) {
        operationInfo.responseSchema = await this.extractResponseSchema(
          operationInfo.responseType,
          operationInfo.apiType
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

  private async extractResponseSchema(
    responseType: string,
    apiType: 'ledger-json-api' | 'validator-api'
  ): Promise<string> {
    // Check cache first
    if (this.schemaCache.has(responseType)) {
      const cached = this.schemaCache.get(responseType);
      if (cached) return cached;
    }

    // Look for the schema in the appropriate schemas directory
    const schemasDir = path.join(
      process.cwd(),
      `src/clients/${apiType}/schemas`
    );
    const apiDir = path.join(schemasDir, 'api');
    let schemaFiles: string[] = [];
    // Include all .ts files in api/ and in the parent schemas directory
    if (fs.existsSync(apiDir)) {
      schemaFiles = fs
        .readdirSync(apiDir)
        .filter(f => f.endsWith('.ts'))
        .map(f => path.join('api', f));
    }
    // Add .ts files from the parent schemas directory
    const parentSchemaFiles = fs
      .readdirSync(schemasDir)
      .filter(f => f.endsWith('.ts'))
      .map(f => f);
    schemaFiles.push(...parentSchemaFiles);

    // Try both the raw responseType and responseType + 'Schema'
    const candidates = [responseType, responseType + 'Schema'];
    for (const candidate of candidates) {
      for (const schemaFile of schemaFiles) {
        const filePath = path.join(schemasDir, schemaFile);
        if (fs.existsSync(filePath)) {
          const schema = await this.findSchemaInFile(filePath, candidate);
          if (schema) {
            this.schemaCache.set(responseType, schema);
            return schema;
          }
        }
      }
    }

    // If not found, throw an error instead of returning the type name
    throw new Error(
      `Could not find or expand schema for response type: ${responseType}`
    );
  }

  private async findSchemaInFile(
    filePath: string,
    responseType: string
  ): Promise<string | null> {
    if (!fs.existsSync(filePath)) return null;

    const sourceCode = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );

    let found = false;
    let schemaDefinition: string | null = null;

    // Build local schema map for this file
    const localSchemaMap = this.buildLocalSchemaMap(filePath);

    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableStatement(node) &&
        node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        for (const declaration of node.declarationList.declarations) {
          if (
            ts.isVariableDeclaration(declaration) &&
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === responseType
          ) {
            found = true;
            schemaDefinition = this.extractSchemaStructure(
              declaration.initializer,
              filePath,
              localSchemaMap
            );
            return;
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return found ? schemaDefinition : null;
  }

  private extractSchemaStructure(
    node: ts.Expression | undefined,
    fromFilePath?: string,
    localSchemaMap?: Map<string, ts.Expression>
  ): string {
    if (!node) return '';

    // Check if it's a call expression
    if (ts.isCallExpression(node)) {
      // Handle z.object, z.array, z.union, etc. as property access expressions
      if (ts.isPropertyAccessExpression(node.expression)) {
        const propertyName = node.expression.name.text;
        switch (propertyName) {
          case 'object':
            return this.extractZodObjectStructure(
              node,
              fromFilePath,
              1,
              localSchemaMap
            );
          case 'array':
            return this.extractZodArrayStructure(
              node,
              fromFilePath,
              localSchemaMap
            );
          case 'union':
            return this.extractZodUnionStructure(
              node,
              fromFilePath,
              localSchemaMap
            );
          default:
            return 'any';
        }
      } else if (ts.isIdentifier(node.expression)) {
        switch (node.expression.text) {
          case 'z.object':
            return this.extractZodObjectStructure(
              node,
              fromFilePath,
              1,
              localSchemaMap
            );
          case 'z.array':
            return this.extractZodArrayStructure(
              node,
              fromFilePath,
              localSchemaMap
            );
          case 'z.union':
            return this.extractZodUnionStructure(
              node,
              fromFilePath,
              localSchemaMap
            );
          default:
            return 'any';
        }
      }
    }

    // If the node is an identifier (e.g., UserSchema), resolve and expand it recursively
    if (ts.isIdentifier(node)) {
      const schemaName = node.text;
      if (schemaName === 'z') {
        return 'any';
      }
      if (schemaName.endsWith('Schema')) {
        const resolvedType = this.resolveSchemaReference(
          schemaName,
          fromFilePath,
          localSchemaMap
        );
        if (resolvedType) {
          return resolvedType;
        }
        throw new Error(`Could not resolve referenced schema: ${schemaName}`);
      }
      throw new Error(
        `Encountered identifier that is not a schema: ${schemaName}`
      );
    }

    throw new Error(
      `Unknown node type in extractSchemaStructure: ${node.kind}`
    );
  }

  private extractZodObjectStructure(
    node: ts.CallExpression,
    fromFilePath?: string,
    indentLevel: number = 1,
    localSchemaMap?: Map<string, ts.Expression>
  ): string {
    const arg = node.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) return '{}';

    const indent = '  '.repeat(indentLevel);
    const propertyMap = new Map<string, string>();

    for (const prop of arg.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const propName = prop.name.text;
        let propType;
        // If the initializer is an identifier and ends with 'Schema', resolve it
        if (
          ts.isIdentifier(prop.initializer) &&
          prop.initializer.text.endsWith('Schema')
        ) {
          propType = this.extractPropertyType(
            prop.initializer,
            fromFilePath,
            indentLevel + 1,
            localSchemaMap
          );
        } else {
          // Pass indentLevel + 1 for nested objects
          propType = this.extractPropertyType(
            prop.initializer,
            fromFilePath,
            indentLevel + 1,
            localSchemaMap
          );
        }

        // Check if the property is optional by looking for .optional() calls
        const isOptional = this.isPropertyOptional(prop.initializer);

        const cleanType = propType
          .replace(' | undefined', '')
          .replace(' | null', '');

        // If the property type is a multi-line object, ensure the semicolon is at the correct indentation
        let displayType = cleanType;
        if (displayType.startsWith('{\n')) {
          // Remove the trailing closing brace if present and add the semicolon at the correct indentation
          displayType = displayType.replace(/\n\s*}$/g, `\n${indent}};`);
        } else {
          // For single-line types, add a semicolon
          displayType = `${displayType};`;
        }

        // Add '?' to the property name if optional, and do not add '| undefined' to the type
        const displayName = isOptional ? `${propName}?` : propName;

        propertyMap.set(propName, `${indent}${displayName}: ${displayType}`);
      }
    }

    // Sort properties in a specific order for better readability
    const sortedProperties = this.sortObjectProperties(propertyMap);

    const openBrace = '{';
    const closeBrace = (indentLevel > 1 ? indent : '') + '}';
    return `${openBrace}
${sortedProperties.join('\n')}
${closeBrace}`;
  }

  private sortObjectProperties(propertyMap: Map<string, string>): string[] {
    // Define the preferred order for common properties
    const propertyOrder = [
      'id',
      'isDeactivated',
      'identityProviderId',
      'primaryParty',
      'metadata',
      'resourceVersion',
      'annotations',
      'userId',
      'party',
      'isLocal',
      'localMetadata',
      'partyIdHint',
      'synchronizerId',
      'user',
      'rights',
      'updateMask',
      'users',
      'nextPageToken',
      'newlyGrantedRights',
      'newlyRevokedRights',
      'sourceIdentityProviderId',
      'targetIdentityProviderId',
      'partyDetails',
      'darFile',
      'packageId',
      'version',
      'status',
      'preferredPackages',
      'preferredPackageVersion',
      'events',
      'contractId',
      'templateId',
      'choice',
      'argument',
      'workflowId',
      'applicationId',
      'commandId',
      'completionId',
      'offset',
      'limit',
      'filters',
      'verbose',
      'transactionId',
      'transactionTreeId',
      'updateId',
      'updateTrees',
      'flatUpdates',
      'transaction',
      'transactionTree',
      'update',
      'updateTree',
      'activeContracts',
      'connectedSynchronizers',
      'latestPrunedOffsets',
      'ledgerEnd',
      'participantId',
      'knownParties',
      'packages',
      'packageStatus',
      'identityProviderConfigs',
      'identityProviderConfig',
      'version',
    ];

    const sortedProperties: string[] = [];
    const remainingProperties: string[] = [];

    // First, add properties in the preferred order
    for (const propName of propertyOrder) {
      if (propertyMap.has(propName)) {
        sortedProperties.push(propertyMap.get(propName)!);
      }
    }

    // Then, add any remaining properties in alphabetical order
    for (const [propName, propString] of propertyMap) {
      if (!propertyOrder.includes(propName)) {
        remainingProperties.push(propString);
      }
    }
    remainingProperties.sort();

    return [...sortedProperties, ...remainingProperties];
  }

  private isPropertyOptional(node: ts.Expression): boolean {
    console.log(`[isPropertyOptional] node kind: ${node.kind}`);

    if (ts.isPropertyAccessExpression(node)) {
      console.log(
        `[isPropertyOptional] PropertyAccessExpression - name: ${node.name.text}`
      );
      if (node.name.text === 'optional') {
        console.log(`[isPropertyOptional] Found 'optional' - returning true`);
        return true;
      }
      // Check if it's a chain like z.string().optional()
      if (ts.isCallExpression(node.expression)) {
        console.log(`[isPropertyOptional] Recursing into CallExpression`);
        return this.isPropertyOptional(node.expression);
      }
    }

    if (ts.isCallExpression(node)) {
      console.log(`[isPropertyOptional] CallExpression - checking expression`);
      if (ts.isPropertyAccessExpression(node.expression)) {
        console.log(
          `[isPropertyOptional] CallExpression with PropertyAccessExpression - name: ${node.expression.name.text}`
        );
        if (node.expression.name.text === 'optional') {
          console.log(
            `[isPropertyOptional] Found 'optional' in CallExpression - returning true`
          );
          return true;
        }
      }
    }

    console.log(`[isPropertyOptional] No optional found - returning false`);
    return false;
  }

  private extractZodArrayStructure(
    node: ts.CallExpression,
    fromFilePath?: string,
    localSchemaMap?: Map<string, ts.Expression>
  ): string {
    const arg = node.arguments[0];
    if (!arg) return 'any[]';

    const elementType = this.extractPropertyType(
      arg,
      fromFilePath,
      2,
      localSchemaMap
    );
    return `${elementType}[]`;
  }

  private extractZodUnionStructure(
    node: ts.CallExpression,
    fromFilePath?: string,
    localSchemaMap?: Map<string, ts.Expression>
  ): string {
    const args = node.arguments;
    if (args.length === 0) return 'any';

    const types = args.map(arg =>
      this.extractPropertyType(arg, fromFilePath, 2, localSchemaMap)
    );
    return types.join(' | ');
  }

  private extractPropertyType(
    node: ts.Expression,
    fromFilePath?: string,
    indentLevel: number = 2,
    localSchemaMap?: Map<string, ts.Expression>
  ): string {
    if (ts.isCallExpression(node)) {
      // Handle chained calls like z.string().optional()
      if (ts.isPropertyAccessExpression(node.expression)) {
        const propertyName = node.expression.name.text;

        // Check if this is a modifier call (optional, nullable, etc.)
        if (propertyName === 'optional' || propertyName === 'nullable') {
          // Get the base type from the expression being modified
          const baseType = this.extractPropertyType(
            node.expression.expression,
            fromFilePath,
            indentLevel,
            localSchemaMap
          );
          if (propertyName === 'optional') {
            return `${baseType} | undefined`;
          } else if (propertyName === 'nullable') {
            return `${baseType} | null`;
          }
        }

        // Handle base Zod types
        switch (propertyName) {
          case 'string':
            return 'string';
          case 'number':
            return 'number';
          case 'boolean':
            return 'boolean';
          case 'object':
            return this.extractZodObjectStructure(
              node,
              fromFilePath,
              indentLevel,
              localSchemaMap
            );
          case 'array':
            return this.extractZodArrayStructure(
              node,
              fromFilePath,
              localSchemaMap
            );
          case 'union':
            return this.extractZodUnionStructure(
              node,
              fromFilePath,
              localSchemaMap
            );
          case 'record':
            return this.extractZodRecordStructure(
              node,
              fromFilePath,
              localSchemaMap
            );
          case 'any':
            return 'any';
          case 'unknown':
            return 'unknown';
          default:
            // If it's not a known Zod type, try to resolve it as a schema reference
            if (
              ts.isIdentifier(node.expression.expression) &&
              node.expression.expression.text === 'z'
            ) {
              return 'any'; // Unknown Zod type
            }
            // Try to resolve as a schema reference
            return this.extractSchemaStructure(
              node,
              fromFilePath,
              localSchemaMap
            );
        }
      }

      // Handle direct identifier calls (legacy format)
      if (ts.isIdentifier(node.expression)) {
        switch (node.expression.text) {
          case 'z.string':
            return 'string';
          case 'z.number':
            return 'number';
          case 'z.boolean':
            return 'boolean';
          case 'z.object':
            return this.extractZodObjectStructure(
              node,
              fromFilePath,
              indentLevel,
              localSchemaMap
            );
          case 'z.array':
            return this.extractZodArrayStructure(
              node,
              fromFilePath,
              localSchemaMap
            );
          case 'z.union':
            return this.extractZodUnionStructure(
              node,
              fromFilePath,
              localSchemaMap
            );
          case 'z.record':
            return this.extractZodRecordStructure(
              node,
              fromFilePath,
              localSchemaMap
            );
          case 'z.any':
            return 'any';
          case 'z.unknown':
            return 'unknown';
          default:
            return 'any';
        }
      }
    }

    // Handle identifier nodes (schema references)
    if (ts.isIdentifier(node)) {
      const schemaName = node.text;
      if (schemaName.endsWith('Schema')) {
        const resolvedType = this.resolveSchemaReference(
          schemaName,
          fromFilePath,
          localSchemaMap
        );
        if (resolvedType) {
          return resolvedType;
        }
        throw new Error(`Could not resolve referenced schema: ${schemaName}`);
      }
      return 'any';
    }

    return 'any';
  }

  private extractZodRecordStructure(
    node: ts.CallExpression,
    fromFilePath?: string,
    localSchemaMap?: Map<string, ts.Expression>
  ): string {
    const args = node.arguments;
    if (args.length === 0) return 'Record<string, any>';

    // In Zod, z.record(valueType) means Record<string, valueType>
    // z.record(keyType, valueType) means Record<keyType, valueType>
    if (args.length === 1) {
      const valueType = args[0]
        ? this.extractPropertyType(args[0], fromFilePath, 2, localSchemaMap)
        : 'any';
      return `Record<string, ${valueType}>`;
    } else if (args.length === 2) {
      const keyType = args[0]
        ? this.extractPropertyType(args[0], fromFilePath, 2, localSchemaMap)
        : 'string';
      const valueType = args[1]
        ? this.extractPropertyType(args[1], fromFilePath, 2, localSchemaMap)
        : 'any';
      return `Record<${keyType}, ${valueType}>`;
    }

    return 'Record<string, any>';
  }

  // Helper to build a map of all exported schemas in a file
  private buildLocalSchemaMap(filePath: string): Map<string, ts.Expression> {
    const schemaMap = new Map<string, ts.Expression>();
    if (!fs.existsSync(filePath)) return schemaMap;
    const sourceCode = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true
    );
    const visit = (node: ts.Node): void => {
      if (
        ts.isVariableStatement(node) &&
        node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        for (const declaration of node.declarationList.declarations) {
          if (
            ts.isVariableDeclaration(declaration) &&
            ts.isIdentifier(declaration.name)
          ) {
            schemaMap.set(declaration.name.text, declaration.initializer!);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return schemaMap;
  }

  private resolveSchemaReference(
    schemaName: string,
    fromFilePath?: string,
    localSchemaMap?: Map<string, ts.Expression>
  ): string | null {
    // Check cache first
    if (this.schemaCache.has(schemaName)) {
      return this.schemaCache.get(schemaName) || null;
    }

    // If fromFilePath is provided, build or use the local schema map
    let schemaMap = localSchemaMap;
    if (!schemaMap && fromFilePath && fs.existsSync(fromFilePath)) {
      schemaMap = this.buildLocalSchemaMap(fromFilePath);
    }
    // Try to resolve from the local schema map first
    if (schemaMap && schemaMap.has(schemaName)) {
      const expr = schemaMap.get(schemaName)!;
      const schemaDefinition = this.extractSchemaStructure(
        expr,
        fromFilePath,
        localSchemaMap
      );
      this.schemaCache.set(schemaName, schemaDefinition);
      return schemaDefinition;
    }

    // Determine which API schemas directory to search based on fromFilePath
    let schemasDir: string;
    if (fromFilePath && fromFilePath.includes('validator-api')) {
      schemasDir = path.join(
        process.cwd(),
        'src/clients/validator-api/schemas'
      );
    } else {
      schemasDir = path.join(
        process.cwd(),
        'src/clients/ledger-json-api/schemas'
      );
    }

    const apiDir = path.join(schemasDir, 'api');
    let schemaFiles: string[] = [];
    if (fs.existsSync(apiDir)) {
      schemaFiles = fs
        .readdirSync(apiDir)
        .filter(f => f.endsWith('.ts'))
        .map(f => path.join('api', f));
    }
    const parentSchemaFiles = fs
      .readdirSync(schemasDir)
      .filter(f => f.endsWith('.ts'))
      .map(f => f);
    schemaFiles.push(...parentSchemaFiles);

    // If fromFilePath is provided, search it first (with schemaMap)
    if (fromFilePath && fs.existsSync(fromFilePath)) {
      // Also build import map for imported schemas
      const sourceCode = fs.readFileSync(fromFilePath, 'utf-8');
      const sourceFile = ts.createSourceFile(
        fromFilePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true
      );
      const importMap: Record<string, string> = {};
      ts.forEachChild(sourceFile, node => {
        if (
          ts.isImportDeclaration(node) &&
          node.importClause &&
          node.moduleSpecifier
        ) {
          const importPath = (node.moduleSpecifier as ts.StringLiteral).text;
          if (
            node.importClause.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings)
          ) {
            for (const specifier of node.importClause.namedBindings.elements) {
              importMap[specifier.name.text] = importPath;
            }
          }
        }
      });
      // If not found locally, check if it's imported and follow the import
      if (importMap[schemaName]) {
        // Resolve the import path relative to fromFilePath
        let importFilePath = importMap[schemaName];
        if (!importFilePath.endsWith('.ts')) importFilePath += '.ts';
        let resolvedPath = '';
        if (importFilePath.startsWith('.')) {
          resolvedPath = path.resolve(
            path.dirname(fromFilePath),
            importFilePath
          );
        } else {
          // Assume import from schemas directory
          resolvedPath = path.join(schemasDir, importFilePath);
        }
        if (fs.existsSync(resolvedPath)) {
          return this.resolveSchemaReference(
            schemaName,
            resolvedPath,
            localSchemaMap
          );
        }
      }
      // If not found, do not retry local search (prevents infinite loop)
    }

    // Fallback: search all schema files
    for (const schemaFile of schemaFiles) {
      const filePath = path.join(schemasDir, schemaFile);
      if (fs.existsSync(filePath)) {
        // Build a local schema map for this file
        const fileSchemaMap = this.buildLocalSchemaMap(filePath);
        if (fileSchemaMap.has(schemaName)) {
          const expr = fileSchemaMap.get(schemaName)!;
          const schemaDefinition = this.extractSchemaStructure(
            expr,
            filePath,
            localSchemaMap
          );
          this.schemaCache.set(schemaName, schemaDefinition);
          return schemaDefinition;
        }
      }
    }
    return null;
  }

  private detectCategories(): { apiType: string; categories: string[] }[] {
    const apiCategories = new Map<string, Set<string>>();

    for (const operation of this.operations) {
      // Extract category from file path
      // Path format: .../operations/v2/category/filename.ts or .../operations/v0/category/filename.ts
      const pathParts = operation.filePath.split('/');
      const operationsIndex = pathParts.findIndex(
        part => part === 'operations'
      );

      if (operationsIndex !== -1 && pathParts[operationsIndex + 2]) {
        const category = pathParts[operationsIndex + 2];
        if (category) {
          if (!apiCategories.has(operation.apiType)) {
            apiCategories.set(operation.apiType, new Set());
          }
          apiCategories.get(operation.apiType)!.add(category);
        }
      }
    }

    return Array.from(apiCategories.entries()).map(([apiType, categories]) => ({
      apiType,
      categories: Array.from(categories).sort(),
    }));
  }

  private generateCategorySection(apiType: string, category: string): string {
    const categoryOperations = this.operations.filter(
      op => op.apiType === apiType && op.filePath.includes(`/${category}/`)
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
      `| [${op.name}](/operations/${op.name.toLowerCase()}/) | ${op.description || 'No description'} |`
  )
  .join('\n')}`;
  }

  private async generateOperationsIndex(): Promise<void> {
    // No frontMatter in generated files

    // Dynamically detect categories from operation file paths
    const apiCategories = this.detectCategories();

    // Generate separate pages for each API
    for (const apiData of apiCategories) {
      const { apiType, categories } = apiData;

      const apiName =
        apiType === 'ledger-json-api' ? 'Ledger JSON API' : 'Validator API';
      const fileName =
        apiType === 'ledger-json-api'
          ? 'ledger-json-api-operations.md'
          : 'validator-api-operations.md';

      const indexContent = `# Canton Node SDK - ${apiName} Operations

This document provides an overview of all available operations in the Canton Node SDK for the ${apiName}.

## Operations by Category

${categories.map(category => this.generateCategorySection(apiType, category)).join('\n\n')}

`;

      const generatedDir = path.join(process.cwd(), 'docs', '_generated');
      if (!fs.existsSync(generatedDir)) {
        fs.mkdirSync(generatedDir, { recursive: true });
      }
      const indexPath = path.join(generatedDir, fileName);
      fs.writeFileSync(indexPath, indexContent);
      console.log(`📄 Generated ${apiName} operations index: ${indexPath}`);
    }
  }

  private async generateOperationDoc(operation: OperationInfo): Promise<void> {
    // Validate that operation name is defined
    if (!operation.name) {
      throw new Error(
        `Missing operation name in file "${operation.filePath}". ` +
          `This operation must have a name exported as a constant.`
      );
    }

    // Validate that response type information is available
    if (!operation.responseSchema && !operation.responseType) {
      // Special case for GetEventsByContractId which uses OpenAPI types
      if (operation.name === 'GetEventsByContractId') {
        operation.responseType = 'EventsByContractIdResponse';
      } else {
        throw new Error(
          `Missing response type information for operation "${operation.name}" in file "${operation.filePath}". ` +
            `This operation must have a response type imported from the schemas directory.`
        );
      }
    }

    // Validate that method is defined
    if (!operation.method) {
      throw new Error(
        `Missing HTTP method for operation "${operation.name}" in file "${operation.filePath}". ` +
          `This operation must have a method defined in the createApiOperation call.`
      );
    }

    const frontMatter = `---
layout: default
sdk_version: ${this.sdkVersion}
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
    : 'None'
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
\`\`\`json
${operation.responseSchema || `\`${operation.responseType}\``}\`\`\`

## Usage

\`\`\`typescript
import { ${operation.apiType === 'ledger-json-api' ? 'LedgerJsonApiClient' : 'ValidatorApiClient'}, EnvLoader } from '@fairmint/canton-node-sdk';

const config = EnvLoader.getConfig('${operation.apiType === 'ledger-json-api' ? 'LEDGER_JSON_API' : 'VALIDATOR_API'}', {
  network: 'devnet',
  provider: '5n'
});

const client = new ${operation.apiType === 'ledger-json-api' ? 'LedgerJsonApiClient' : 'ValidatorApiClient'}(config);

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
      `${operation.name.toLowerCase()}.md`
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
