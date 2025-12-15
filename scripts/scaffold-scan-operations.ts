import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const SPEC_PATH = 'libs/splice/apps/scan/src/main/openapi/scan.yaml';
const OUTPUT_DIR = 'src/clients/scan/operations';

function toCamelCase(str: string): string {
  return str.replace(/([-_][a-z])/g, (group) =>
    group.toUpperCase().replace('-', '').replace('_', '')
  ).replace(/^[a-z]/, (g) => g.toUpperCase());
}

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

function mapOpenApiTypeToZod(schema: any): string {
  if (!schema) return 'z.any()';
  if (schema.type === 'string') return 'z.string()';
  if (schema.type === 'integer' || schema.type === 'number') return 'z.number()';
  if (schema.type === 'boolean') return 'z.boolean()';
  if (schema.type === 'array') return `z.array(${mapOpenApiTypeToZod(schema.items)})`;
  return 'z.unknown()';
}

function generateOperation(
  urlPath: string,
  method: string,
  operationDef: any
) {
  const operationId = operationDef.operationId;
  if (!operationId) return;

  const exportName = toCamelCase(operationId);
  const pathParts = urlPath.replace(/\{[^}]+\}/g, '_param_').split('/').filter(p => p);
  const relativePath = pathParts.join('/');
  const filePath = path.join(OUTPUT_DIR, relativePath, `${method.toLowerCase()}.ts`);
  
  const depth = pathParts.length;
  const backToScan = '../'.repeat(depth + 1);
  const backToSrc = '../'.repeat(depth + 3);
  const coreImport = `${backToSrc}core`;
  const generatedImport = `${backToSrc}generated/scan`;

  // Extract params
  const parameters = operationDef.parameters || [];
  const pathParams = parameters.filter((p: any) => p.in === 'path');
  const queryParams = parameters.filter((p: any) => p.in === 'query');
  const hasRequestBody = !!operationDef.requestBody;

  let paramsType = 'void';
  let zodSchemaBody = 'z.object({})'; // Default empty object if no params
  
  if (pathParams.length > 0 || queryParams.length > 0 || hasRequestBody) {
    // Construct Zod schema
    const zodFields: string[] = [];
    
    pathParams.forEach((p: any) => {
      zodFields.push(`${p.name}: ${mapOpenApiTypeToZod(p.schema)}`);
    });
    
    queryParams.forEach((p: any) => {
      let field = `${p.name}: ${mapOpenApiTypeToZod(p.schema)}`;
      if (!p.required) field += '.optional()';
      zodFields.push(field);
    });

    if (hasRequestBody) {
       // Ideally we would map the request body schema to Zod, but it's complex for refs.
       // We can use z.unknown() or leave it out of validation if we trust the type system.
       // But createApiOperation requires paramsSchema to validate params passed to execute.
       // The 'body' is usually passed as a property 'body' in params.
       zodFields.push(`body: z.unknown()`);
    }

    if (zodFields.length > 0) {
      zodSchemaBody = `z.object({\n    ${zodFields.join(',\n    ')}\n  })`;
    }

    // Construct Params Type using `paths`
    // paths['/url']['method']['parameters']['path'] & ...['query']
    // For body: paths['/url']['method']['requestBody']['content']['application/json']
    
    const parts: string[] = [];
    
    if (pathParams.length > 0) {
      parts.push(`paths['${urlPath}']['${method}']['parameters']['path']`);
    }
    
    if (queryParams.length > 0) {
      parts.push(`paths['${urlPath}']['${method}']['parameters']['query']`);
    }
    
    if (hasRequestBody) {
        // If there are other params, we intersect. If strictly body, we might need a wrapper.
        // Usually our client usage is { ...params, body: ... }
        // So we define an interface that extends the path/query params and adds body.
        
        // This is getting complicated to construct purely from `paths` types inline.
        // It's cleaner to define an interface `GetDsoInfoParams` that intersects them.
        
        // But `paths['...']['parameters']` returns an object type.
    }
    
    if (parts.length > 0) {
        paramsType = parts.join(' & ');
        if (hasRequestBody) {
            const bodyType = `paths['${urlPath}']['${method}']['requestBody']['content']['application/json']`;
            paramsType = `(${paramsType}) & { body: ${bodyType} }`;
        }
    } else if (hasRequestBody) {
         const bodyType = `paths['${urlPath}']['${method}']['requestBody']['content']['application/json']`;
         paramsType = `{ body: ${bodyType} }`;
    }
  }

  // Build URL function
  let buildUrlBody = '';
  if (queryParams.length > 0) {
    buildUrlBody = `let url = \`\${apiUrl}${urlPath.replace(/\{([^}]+)\}/g, (match, name) => `\${params.${name}}`)}\`;`;
    buildUrlBody += `\n    const queryParams = new URLSearchParams();`;
    queryParams.forEach((p: any) => {
      buildUrlBody += `\n    if (params['${p.name}'] !== undefined) {`;
      buildUrlBody += `\n      const val = params['${p.name}'];`;
      buildUrlBody += `\n      if (Array.isArray(val)) {`;
      buildUrlBody += `\n        val.forEach((v: any) => queryParams.append('${p.name}', String(v)));`;
      buildUrlBody += `\n      } else {`;
      buildUrlBody += `\n        queryParams.append('${p.name}', String(val));`;
      buildUrlBody += `\n      }`;
      buildUrlBody += `\n    }`;
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
     responseType = 'unknown'; // Better than any
  }

  // Request Data Builder
  let buildRequestDataProp = '';
  if (hasRequestBody) {
      buildRequestDataProp = `\n  buildRequestData: (params) => params.body,`;
  }

  const content = `import { z } from 'zod';
import { createApiOperation } from '${coreImport}';
import { type paths } from '${generatedImport}';

export const ${exportName} = createApiOperation<${paramsType}, ${responseType}>({
  paramsSchema: ${zodSchemaBody},
  method: '${method.toUpperCase()}',
  buildUrl: (${paramsType === 'void' ? '_params' : 'params'}, apiUrl) => {
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
