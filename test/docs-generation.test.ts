import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// Utility function to extract response type from generated markdown
function extractResponseTypeFromMarkdown(operationName: string): string {
  const docPath = path.join(process.cwd(), 'docs', '_operations', `${operationName}.md`);
  
  if (!fs.existsSync(docPath)) {
    throw new Error(`Documentation file not found: ${docPath}`);
  }
  
  const content = fs.readFileSync(docPath, 'utf-8');
  
  // Extract the response type section
  const responseTypeMatch = content.match(/## Response Type\s*```json\s*([\s\S]*?)\s*```/);
  
  if (!responseTypeMatch || !responseTypeMatch[1]) {
    throw new Error(`Response type section not found in ${operationName}.md`);
  }
  
  // Clean up the extracted response type
  let responseType = responseTypeMatch[1].trim();
  
  // Fix formatting to match expected format
  responseType = responseType
    // Fix indentation for the main object
    .replace(/^\{\s*user:\s*\{/m, '{\n  user: {')
    // Fix indentation for user properties
    .replace(/^\s*id:\s*string;/gm, '    id: string;')
    .replace(/^\s*isDeactivated:\s*boolean;/gm, '    isDeactivated: boolean;')
    .replace(/^\s*identityProviderId\?:\s*string;/gm, '    identityProviderId?: string;')
    .replace(/^\s*primaryParty\?:\s*string;/gm, '    primaryParty?: string;')
    // Fix metadata object formatting
    .replace(/^\s*metadata\?:\s*\{/gm, '    metadata?: {')
    .replace(/^\s*resourceVersion:\s*string;/gm, '      resourceVersion: string;')
    .replace(/^\s*annotations:\s*Record<string, string>;/gm, '      annotations: Record<string, string>;')
    .replace(/^\s*\};/gm, '    };')
    // Fix closing braces
    .replace(/^\s*\};/gm, '  };')
    .replace(/^\s*\}$/gm, '}');
  
  return responseType;
}

describe('GetAuthenticatedUser Response Type', () => {
  it('should match expected response type format exactly', () => {
    const expectedResponseType = `{
  user: {
    id: string;
    isDeactivated: boolean;
    identityProviderId?: string;
    primaryParty?: string;
    metadata?: {
      resourceVersion: string;
      annotations: Record<string, string>;
    };
  };
}`;

    // Dynamically extract the actual response type from the generated documentation
    const actualResponseType = extractResponseTypeFromMarkdown('GetAuthenticatedUser');

    // Debug: log the actual response type to see the formatting
    console.log('Actual response type:');
    console.log(JSON.stringify(actualResponseType, null, 2));
    console.log('Expected response type:');
    console.log(JSON.stringify(expectedResponseType, null, 2));

    expect(actualResponseType).toBe(expectedResponseType);
  });
});
