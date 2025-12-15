import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const SPEC_PATH = 'libs/splice/apps/scan/src/main/openapi/scan.yaml';
const OUTPUT_DIR = 'src/clients/scan/operations';

// Helper to convert kebab-case/snake_case to CamelCase
function toCamelCase(str: string): string {
  return str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace('-', '').replace('_', '')
  ).replace(/^[a-z]/, (g) => g.toUpperCase());
}

// Helper to recursively create directory
function ensureDirectoryExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parseSpec() {
  const fileContents = fs.readFileSync(SPEC_PATH, 'utf8');
  return yaml.load(fileContents) as any;
}

function generateOperation(
  urlPath: string,
  method: string,
  operationDef: any
) {
  const operationId = operationDef.operationId;
  if (!operationId) return;

  const exportName = toCamelCase(operationId);
  
  // Construct output path
  // Remove parameters from path for file structure: /v0/domains/{id} -> /v0/domains/
  // But we want to keep unique structure.
  // Method is usually the file name: get.ts, post.ts
  const pathParts = urlPath.replace(/\{[^}]+\}/g, '_param_').split('/').filter(p => p);
  const relativePath = pathParts.join('/');
  const filePath = path.join(OUTPUT_DIR, relativePath, `${method.toLowerCase()}.ts`);
  
  const depth = pathParts.length;
  const backToScan = '../'.repeat(depth + 1); // +1 to get out of operations dir
  const backToSrc = '../'.repeat(depth + 3); // operations -> scan -> clients -> src
  const coreImport = `${backToSrc}core`;
  const generatedImport = `${backToSrc}generated/scan`;

  // Extract params
  const parameters = operationDef.parameters || [];
  const pathParams = parameters.filter((p: any) => p.in === 'path');
  const queryParams = parameters.filter((p: any) => p.in === 'query');
  
  // Params interface
  let paramsInterface = 'void';
  let paramFields: string[] = [];
  
  if (pathParams.length > 0 || queryParams.length > 0 || operationDef.requestBody) {
    paramFields = [
      ...pathParams.map((p: any) => `${p.name}: string;`),
      ...queryParams.map((p: any) => `${p.name}?: ${p.required ? 'any' : 'any'};`), 
    ];
    
    if (operationDef.requestBody) {
        paramFields.push('body: any;');
    }
    
    paramsInterface = `{\n  ${paramFields.join('\n  ')}\n}`;
  }

  // Build URL function
  let buildUrlBody = '';
  if (queryParams.length > 0) {
    buildUrlBody = `let url = \`\${apiUrl}${urlPath.replace(/\{([^}]+)\}/g, (match, name) => `\${params.${name}}`)}\`;`;
    buildUrlBody += `\n    const queryParams = new URLSearchParams();`;
    queryParams.forEach((p: any) => {
      buildUrlBody += `\n    if (params['${p.name}'] !== undefined) queryParams.append('${p.name}', String(params['${p.name}']));`;
    });
    buildUrlBody += `\n    if (Array.from(queryParams).length > 0) url += \`?\${queryParams.toString()}\`;`;
    buildUrlBody += `\n    return url;`;
  } else {
    buildUrlBody = `const url = \`\${apiUrl}${urlPath.replace(/\{([^}]+)\}/g, (match, name) => `\${params.${name}}`)}\`;`;
    buildUrlBody += `\n    return url;`;
  }

  // Response Type
  const successResponse = operationDef.responses['200'];
  let responseType = 'void';
  if (successResponse?.content?.['application/json']) {
    responseType = `paths['${urlPath}']['${method}']['responses']['200']['content']['application/json']`;
  } else if (successResponse?.content?.['application/x-protobuf']) {
     // fallback
     responseType = 'any';
  }

  // Request Data Builder (for POST/PUT)
  let buildRequestDataProp = '';
  if (operationDef.requestBody) {
      buildRequestDataProp = `\n  buildRequestData: (params) => params.body,`;
  }

  const content = `/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '${coreImport}';
import { type paths } from '${generatedImport}';

export interface ${exportName}Params ${paramsInterface === 'void' ? '{}' : paramsInterface}

export const ${exportName} = createApiOperation<${paramsInterface === 'void' ? 'void' : `${exportName}Params`}, ${responseType}>({
  paramsSchema: z.any(),
  method: '${method.toUpperCase()}',
  buildUrl: (${paramsInterface === 'void' ? '_params' : 'params'}, apiUrl) => {
    ${buildUrlBody}
  },${buildRequestDataProp}
});
`;

  ensureDirectoryExists(filePath);
  fs.writeFileSync(filePath, content);
  console.log(`Generated ${filePath}`);
}

function main() {
  const spec = parseSpec();
  const paths = spec.paths;

  for (const urlPath in paths) {
    const pathItem = paths[urlPath];
    for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
      if (pathItem[method]) {
        generateOperation(urlPath, method, pathItem[method]);
      }
    }
  }
}

main();
