#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

interface OperationInfo {
  name: string;
  filePath: string;
  testPath: string;
  paramsSchema: string;
  method: string;
  endpoint: string;
}

async function findOperations(): Promise<OperationInfo[]> {
  const operations: OperationInfo[] = [];

  // Find all operation files
  const operationFiles = await glob('src/clients/**/*.ts', {
    ignore: [
      '**/index.ts',
      '**/register.ts',
      '**/schemas/**',
      '**/*.generated.ts',
    ],
  });

  for (const file of operationFiles) {
    const content = fs.readFileSync(file, 'utf-8');

    // Check if this is an operation file by looking for createApiOperation
    if (content.includes('createApiOperation')) {
      const nameMatch = content.match(
        /export const (\w+) = createApiOperation/
      );
      if (nameMatch && nameMatch[1]) {
        const name = nameMatch[1];
        const methodMatch = content.match(/method:\s*['"`]([A-Z]+)['"`]/);
        const endpointMatch = content.match(
          /endpoint\s*=\s*['"`]([^'"`]+)['"`]/
        );
        const paramsSchemaMatch = content.match(/paramsSchema:\s*(\w+)/);

        const method = methodMatch && methodMatch[1] ? methodMatch[1] : 'GET';
        const endpoint =
          endpointMatch && endpointMatch[1] ? endpointMatch[1] : '/unknown';
        const paramsSchema =
          paramsSchemaMatch && paramsSchemaMatch[1]
            ? paramsSchemaMatch[1]
            : 'z.any()';

        // Generate test path
        const relativePath = path.relative('src', file);
        const testPath = `test/${relativePath.replace('.ts', '.test.ts')}`;

        operations.push({
          name,
          filePath: file,
          testPath,
          paramsSchema,
          method,
          endpoint,
        });
      }
    }
  }

  return operations;
}

function generateTestContent(operation: OperationInfo): string {
  const importPath = path
    .relative(
      path.dirname(operation.testPath),
      path.dirname(operation.filePath)
    )
    .replace(/\\/g, '/');
  const mockClientPath = path
    .relative(path.dirname(operation.testPath), 'test/utils')
    .replace(/\\/g, '/');
  const configPath = path
    .relative(path.dirname(operation.testPath), 'test/config')
    .replace(/\\/g, '/');

  const isValidatorApi = operation.filePath.includes('validator-api');
  const isLighthouseApi = operation.filePath.includes('lighthouse-api');

  let mockClientClass = 'MockLedgerJsonApiClient';
  let apiUrlKey = 'LEDGER_JSON_API';

  if (isValidatorApi) {
    mockClientClass = 'MockValidatorApiClient';
    apiUrlKey = 'VALIDATOR_API';
  } else if (isLighthouseApi) {
    mockClientClass = 'MockLighthouseApiClient';
    apiUrlKey = 'LIGHTHOUSE_API';
  }

  return `import { ${mockClientClass} } from '${mockClientPath}';
import { ${operation.name} } from '${importPath}/${operation.name}';
import { mockClientConfig, mockApiUrls } from '${configPath}/testConfig';

describe('${operation.name} Operation', () => {
  let mockClient: ${mockClientClass};
  let operation: InstanceType<typeof ${operation.name}>;

  beforeEach(() => {
    mockClient = new ${mockClientClass}(mockClientConfig);
    operation = new ${operation.name}(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a ${operation.method} request to the correct endpoint', async () => {
      // Arrange
      const params = ${operation.paramsSchema === 'z.any()' ? '{}' : '{}'};
      const mockResponse = {};
      const expectedUrl = \`\${mockApiUrls.${apiUrlKey}}${operation.endpoint}\`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      const result = await operation.execute(params);

      // Assert
      expect(result).toEqual(mockResponse);
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
      
      const request = requests[0];
      expect(request).toBeDefined();
      expect(request!.method).toBe('${operation.method}');
      expect(request!.url).toBe(expectedUrl);
    });

    it('should include proper headers in the request', async () => {
      // Arrange
      const params = ${operation.paramsSchema === 'z.any()' ? '{}' : '{}'};
      const mockResponse = {};
      const expectedUrl = \`\${mockApiUrls.${apiUrlKey}}${operation.endpoint}\`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.headers).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should propagate network errors', async () => {
      // Arrange
      const params = ${operation.paramsSchema === 'z.any()' ? '{}' : '{}'};
      const expectedUrl = \`\${mockApiUrls.${apiUrlKey}}${operation.endpoint}\`;
      const networkError = new Error('Network error');
      
      mockClient.setMockError(expectedUrl, networkError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Network error');
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
    });
  });

  describe('Parameter Validation', () => {
    it('should accept valid parameters', async () => {
      // Arrange
      const params = ${operation.paramsSchema === 'z.any()' ? '{}' : '{}'};
      const mockResponse = {};
      const expectedUrl = \`\${mockApiUrls.${apiUrlKey}}${operation.endpoint}\`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });
  });
});
`;
}

async function generateTests(): Promise<void> {
  console.log('Finding operations...');
  const operations = await findOperations();

  console.log(`Found ${operations.length} operations:`);
  operations.forEach(op => console.log(`  - ${op.name} (${op.filePath})`));

  console.log('\nGenerating tests...');

  for (const operation of operations) {
    // Create test directory if it doesn't exist
    const testDir = path.dirname(operation.testPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Check if test already exists
    if (fs.existsSync(operation.testPath)) {
      console.log(`  Skipping ${operation.name} - test already exists`);
      continue;
    }

    const testContent = generateTestContent(operation);
    fs.writeFileSync(operation.testPath, testContent);
    console.log(`  Generated test for ${operation.name}`);
  }

  console.log('\nTest generation complete!');
}

if (require.main === module) {
  generateTests().catch(console.error);
}
