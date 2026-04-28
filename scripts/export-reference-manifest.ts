#!/usr/bin/env tsx
/**
 * Builds a JSON reference manifest for web docs (@fairmint/canton-node-sdk public API).
 * Reads package.json, parses generated API client shims, walks core/utils barrels, lists examples/scripts.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Program } from 'typescript';
import {
  createSdkProgram,
  fallbackClientMethodDocs,
  findPublicMethodLine,
  parseClientValueImports,
  resolveClientMethodDocs,
  uniqueOps,
} from './reference-client-method-docs';

const REPO_ROOT = path.resolve(__dirname, '..');

const SCHEMA_VERSION = 2 as const;

type Transport = 'http' | 'websocket';

export interface ReferenceParamDoc {
  name: string;
  type: string;
  optional?: boolean;
}

export interface ReferenceMember {
  kind: string;
  name: string;
  id?: string;
  summary?: string;
  sourceFile?: string;
  sourceLine?: number;
  sourceUrl?: string;
  /** Human-readable TypeScript signature (expanded types). */
  signature?: string;
  /** Raw `method!: (params: Parameters<InstanceType<…>>) => …` from the generated client. */
  implementationSignature?: string;
  inputSummary?: string;
  returnSummary?: string;
  params?: ReferenceParamDoc[];
  returnType?: string;
  parent?: string;
  receiver?: string;
  importPath?: string;
  category?: string;
  operationClasses?: string[];
  transport?: Transport;
  members?: ReferenceMember[];
}

export interface ReferenceCategory {
  id: string;
  title: string;
  members: ReferenceMember[];
}

export interface ReferenceManifest {
  schemaVersion: typeof SCHEMA_VERSION;
  package: {
    name: string;
    version: string;
    homepage?: string;
    repository?: string;
    description?: string;
  };
  generatedAt: string;
  categories: ReferenceCategory[];
}

const CLIENT_RECEIVER: Record<string, string> = {
  LedgerJsonApiClient: 'canton.ledger',
  ValidatorApiClient: 'canton.validator',
  ScanApiClient: 'canton.scan',
};

/** Satisfy `exactOptionalPropertyTypes` — omit keys when value is undefined */
function member(input: {
  kind: string;
  name: string;
  id?: string;
  summary?: string;
  sourceFile?: string;
  sourceLine?: number;
  sourceUrl?: string;
  signature?: string;
  implementationSignature?: string;
  inputSummary?: string;
  returnSummary?: string;
  params?: ReferenceParamDoc[];
  returnType?: string;
  parent?: string;
  receiver?: string;
  importPath?: string;
  category?: string;
  operationClasses?: string[];
  transport?: Transport;
  members?: ReferenceMember[];
}): ReferenceMember {
  const m: ReferenceMember = { kind: input.kind, name: input.name };
  if (input.id !== undefined) m.id = input.id;
  if (input.summary !== undefined) m.summary = input.summary;
  if (input.sourceFile !== undefined) m.sourceFile = input.sourceFile;
  if (input.sourceLine !== undefined) m.sourceLine = input.sourceLine;
  if (input.sourceUrl !== undefined) m.sourceUrl = input.sourceUrl;
  if (input.signature !== undefined) m.signature = input.signature;
  if (input.implementationSignature !== undefined) m.implementationSignature = input.implementationSignature;
  if (input.inputSummary !== undefined) m.inputSummary = input.inputSummary;
  if (input.returnSummary !== undefined) m.returnSummary = input.returnSummary;
  if (input.params !== undefined) m.params = input.params;
  if (input.returnType !== undefined) m.returnType = input.returnType;
  if (input.parent !== undefined) m.parent = input.parent;
  if (input.receiver !== undefined) m.receiver = input.receiver;
  if (input.importPath !== undefined) m.importPath = input.importPath;
  if (input.category !== undefined) m.category = input.category;
  if (input.operationClasses !== undefined) m.operationClasses = input.operationClasses;
  if (input.transport !== undefined) m.transport = input.transport;
  if (input.members !== undefined) m.members = input.members;
  return m;
}

function githubBlobMainBase(repoUrl: string | undefined): string {
  const raw = repoUrl?.replace(/^git\+/, '').replace(/\.git\s*$/, '').trim() ?? '';
  const m = /github\.com[/:]([^/]+\/[^/]+)/.exec(raw);
  if (m?.[1]) return `https://github.com/${m[1]}/blob/main`;
  return 'https://github.com/Fairmint/canton-node-sdk/blob/main';
}

function implementationSignatureFromParsed(methodName: string, signatureField: string): string {
  const idx = signatureField.indexOf(': ');
  const tail = idx >= 0 ? signatureField.slice(idx + 2) : signatureField;
  return `${methodName}!: ${tail}`;
}

function enrichGeneratedClientMethods(
  program: Program | undefined,
  generatedAbs: string,
  methods: ReferenceMember[],
  className: string,
  blobBase: string
): ReferenceMember[] {
  const content = readText(generatedAbs);
  const importMap = parseClientValueImports(content, generatedAbs);
  const receiver = CLIENT_RECEIVER[className] ?? className;
  const importPath = '@fairmint/canton-node-sdk';
  const relSf = rel(generatedAbs);

  return methods.map((m) => {
    if (m.kind !== 'client-method') return m;
    const line = findPublicMethodLine(content, m.name);
    const implSig = implementationSignatureFromParsed(m.name, m.signature ?? '');
    const opNames = uniqueOps(extractInstanceTypes(m.signature ?? ''));
    const transport = m.transport ?? 'http';

    const sigTail =
      m.signature && m.signature.includes(': ') ? m.signature.slice(m.signature.indexOf(': ') + 2) : '';

    const resolved =
      program &&
      resolveClientMethodDocs(program, importMap, {
        methodName: m.name,
        implementationSignature: implSig,
        operationNames: opNames.length > 0 ? opNames : (m.operationClasses ?? []),
        transport,
        clientShimTail: sigTail,
      });
    const docs =
      resolved ??
      fallbackClientMethodDocs({
        methodName: m.name,
        implementationSignature: implSig,
        operationNames: opNames.length > 0 ? opNames : (m.operationClasses ?? []),
        transport,
      });

    const sourceUrl =
      line !== undefined ? `${blobBase}/${relSf.replace(/^\//, '')}#L${line}` : undefined;

    return member({
      kind: 'client-method',
      name: m.name,
      id: `${className}.${m.name}`,
      ...(m.summary !== undefined ? { summary: m.summary } : {}),
      sourceFile: m.sourceFile ?? relSf,
      ...(line !== undefined ? { sourceLine: line } : {}),
      ...(sourceUrl !== undefined ? { sourceUrl } : {}),
      signature: docs.signature,
      implementationSignature: docs.implementationSignature,
      ...(docs.params !== undefined && docs.params.length > 0 ? { params: docs.params } : {}),
      ...(docs.returnType !== undefined ? { returnType: docs.returnType } : {}),
      inputSummary: docs.inputSummary,
      returnSummary: docs.returnSummary,
      operationClasses: docs.operationClasses,
      parent: className,
      receiver,
      importPath,
      category: className,
      ...(transport !== undefined ? { transport } : {}),
    });
  });
}

const GENERATED_CLIENTS: Array<{ id: string; title: string; generatedFile: string }> = [
  {
    id: 'client-ledger-json-api',
    title: 'LedgerJsonApiClient',
    generatedFile: path.join(REPO_ROOT, 'src/clients/ledger-json-api/LedgerJsonApiClient.generated.ts'),
  },
  {
    id: 'client-validator-api',
    title: 'ValidatorApiClient',
    generatedFile: path.join(REPO_ROOT, 'src/clients/validator-api/ValidatorApiClient.generated.ts'),
  },
  {
    id: 'client-scan-api',
    title: 'ScanApiClient',
    generatedFile: path.join(REPO_ROOT, 'src/clients/scan-api/ScanApiClient.generated.ts'),
  },
];

function readText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

function rel(p: string): string {
  return path.relative(REPO_ROOT, p).replace(/\\/g, '/');
}

function firstParagraph(jsdoc: string | undefined): string | undefined {
  if (!jsdoc) return undefined;
  const body = jsdoc
    .replace(/^\/\*\*\s*/s, '')
    .replace(/\s*\*\/$/s, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').replace(/^\s*/, ''))
    .join('\n')
    .trim();
  const para = body.split(/\n\s*\n|\n\s*@/)[0];
  const trimmed = para?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function inferTransport(signature: string): Transport {
  if (
    signature.includes('WebSocketHandlers') ||
    signature.includes('WebSocketSubscription') ||
    signature.includes("['connect']") ||
    signature.includes("['subscribe']")
  ) {
    return 'websocket';
  }
  return 'http';
}

function extractInstanceTypes(signature: string): string[] {
  const out: string[] = [];
  for (const m of signature.matchAll(/InstanceType<typeof\s+(\w+)>/g)) {
    const t = m[1];
    if (t !== undefined) out.push(t);
  }
  return out;
}

/** Take the last Jsdoc block immediately before a method's `public` line (avoids picking up the class banner). */
function extractTrailingJsDoc(before: string): string | undefined {
  const idx = before.lastIndexOf('/**');
  if (idx < 0) return undefined;
  const rest = before.slice(idx);
  const end = rest.indexOf('*/');
  if (end < 0) return undefined;
  const body = rest.slice(3, end).trim();
  if (!body) return undefined;
  return firstParagraph(`/**\n${body}\n */`);
}

/** Parse `LedgerJsonApiClient.generated.ts` (etc.) for class + public method shims. */
function parseGeneratedClient(generatedFile: string): {
  className: string;
  classSummary?: string;
  methods: ReferenceMember[];
} {
  const content = readText(generatedFile);
  const classMatch = /(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?export\s+class\s+(\w+)/.exec(content);
  const className = classMatch?.[2] ?? path.basename(generatedFile, '.ts');
  const classSummary = firstParagraph(classMatch?.[1]);

  const methods: ReferenceMember[] = [];
  const methodDecl = /^\s*public\s+(\w+)!\s*:\s*([^;]+);/gm;
  let m: RegExpExecArray | null;
  while ((m = methodDecl.exec(content)) !== null) {
    const name = m[1];
    const sigRaw = m[2];
    if (name === undefined || sigRaw === undefined) continue;
    const before = content.slice(Math.max(0, (m.index ?? 0) - 12000), m.index ?? 0);
    const summary = extractTrailingJsDoc(before);
    const signature = `${name}: ${sigRaw.trim()}`;
    const ops = extractInstanceTypes(sigRaw);
    methods.push(
      member({
        kind: 'client-method',
        name,
        ...(summary !== undefined ? { summary } : {}),
        sourceFile: rel(generatedFile),
        signature,
        ...(ops.length > 0 ? { operationClasses: ops } : {}),
        parent: className,
        transport: inferTransport(sigRaw),
      })
    );
  }

  const out: { className: string; classSummary?: string; methods: ReferenceMember[] } = {
    className,
    methods,
  };
  if (classSummary !== undefined) out.classSummary = classSummary;
  return out;
}

function extractExportStarFrom(spec: string, fromDir: string): string | undefined {
  const mm = /export\s+\*\s+from\s+['"]([^'"]+)['"]/.exec(spec);
  if (!mm?.[1]) return undefined;
  const resolved = path.resolve(fromDir, mm[1]);
  const cands = [`${resolved}.ts`, path.join(resolved, 'index.ts')];
  for (const c of cands) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function scanDirectExports(tsPath: string, categoryLabel: string): ReferenceMember[] {
  const content = readText(tsPath);
  const out: ReferenceMember[] = [];

  const tryAdd = (kind: string | undefined, name: string | undefined, jsdoc: string | undefined): void => {
    // Skip private/internal-looking names
    if (kind === undefined || name === undefined || name.startsWith('_')) return;
    const summary = firstParagraph(jsdoc);
    out.push(
      member({
        kind: `core-${kind}`,
        name,
        ...(summary !== undefined ? { summary } : {}),
        sourceFile: rel(tsPath),
        parent: categoryLabel,
      })
    );
  };

  const re =
    /(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?(?:export\s+(?:declare\s+)?)(?:abstract\s+)?(class|interface|type|enum)\s+(\w+)/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(content)) !== null) {
    tryAdd(mm[2], mm[3], mm[1]);
  }

  const reFn =
    /(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?export\s+(?:async\s+)?function\s+(\w+)\s*\(/g;
  while ((mm = reFn.exec(content)) !== null) {
    tryAdd('function', mm[2], mm[1]);
  }

  const reConst =
    /(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?export\s+const\s+(\w+)\s*(?::|=)/g;
  while ((mm = reConst.exec(content)) !== null) {
    tryAdd('const', mm[2], mm[1]);
  }

  return out;
}

/** Walk barrel files under a root `index.ts` and collect direct exports from leaf modules. */
function collectFromBarrel(
  entry: string,
  categoryPrefix: string,
  visited: Set<string>
): ReferenceMember[] {
  if (visited.has(entry)) return [];
  visited.add(entry);
  const content = readText(entry);
  const fromDir = path.dirname(entry);
  const members: ReferenceMember[] = [];

  const exportStarLines = content.split('\n').filter((l) => /^\s*export\s+\*\s+from\s+['"]/.test(l));
  const isPureBarrel =
    exportStarLines.length > 0 &&
    content
      .split('\n')
      .every((l) => {
        const t = l.trim();
        if (!t || t.startsWith('//')) return true;
        if (t.startsWith('/*')) return true;
        return /^\s*export\s+\*\s+from\s+['"]/.test(l);
      });

  if (isPureBarrel) {
    for (const line of exportStarLines) {
      const target = extractExportStarFrom(line, fromDir);
      if (target) {
        members.push(...collectFromBarrel(target, categoryPrefix, visited));
      }
    }
    return members;
  }

  // Mixed barrel (e.g. export * and export { x }) — scan direct exports in this file, then follow stars.
  members.push(...scanDirectExports(entry, categoryPrefix));
  for (const line of exportStarLines) {
    const target = extractExportStarFrom(line, fromDir);
    if (target) {
      members.push(...collectFromBarrel(target, categoryPrefix, visited));
    }
  }

  return members;
}

function dedupeMembers(members: ReferenceMember[]): ReferenceMember[] {
  const seen = new Set<string>();
  const out: ReferenceMember[] = [];
  for (const m of members) {
    const key = `${m.name}|${m.sourceFile ?? ''}|${m.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function parseCantonEntry(): ReferenceMember[] {
  const cantonPath = path.join(REPO_ROOT, 'src/Canton.ts');
  const content = readText(cantonPath);
  const members: ReferenceMember[] = [];

  const iface = /export\s+interface\s+CantonConfig\s*\{([\s\S]*?)\n\}/.exec(content);
  if (iface?.[1]) {
    const body = iface[1];
    const propRe = /(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?(?:readonly\s+)?(\w+)(\?)?:/g;
    let pm: RegExpExecArray | null;
    while ((pm = propRe.exec(body)) !== null) {
      const fieldName = pm[2];
      if (fieldName === undefined) continue;
      const summary = firstParagraph(pm[1]);
      members.push(
        member({
          kind: 'config-field',
          name: fieldName,
          ...(summary !== undefined ? { summary } : {}),
          parent: 'CantonConfig',
          sourceFile: rel(cantonPath),
        })
      );
    }
  }

  const cls = /(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?export\s+class\s+Canton\b/.exec(content);
  if (cls) {
    const summary = firstParagraph(cls[1]);
    members.push(
      member({
        kind: 'class',
        name: 'Canton',
        ...(summary !== undefined ? { summary } : {}),
        sourceFile: rel(cantonPath),
      })
    );
  }

  const methodRe = /(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?public\s+(?:async\s+)?(\w+)\s*\(/g;
  let mm: RegExpExecArray | null;
  while ((mm = methodRe.exec(content)) !== null) {
    const methodName = mm[2];
    if (methodName === undefined) continue;
    const summary = firstParagraph(mm[1]);
    members.push(
      member({
        kind: 'method',
        name: methodName,
        ...(summary !== undefined ? { summary } : {}),
        parent: 'Canton',
        sourceFile: rel(cantonPath),
      })
    );
  }

  return members;
}

function listTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map((f) => rel(path.join(dir, f)))
    .sort();
}

export function buildReferenceManifest(): ReferenceManifest {
  const pkgPath = path.join(REPO_ROOT, 'package.json');
  const pkg = JSON.parse(readText(pkgPath)) as {
    name: string;
    version: string;
    homepage?: string;
    repository?: { url?: string };
    description?: string;
  };

  let program: Program | undefined;
  try {
    program = createSdkProgram(REPO_ROOT);
  } catch {
    program = undefined;
  }

  const blobBase = githubBlobMainBase(pkg.repository?.url);

  const categories: ReferenceCategory[] = [];

  categories.push({
    id: 'entry',
    title: 'Entry (Canton)',
    members: parseCantonEntry(),
  });

  for (const c of GENERATED_CLIENTS) {
    const { className, classSummary, methods } = parseGeneratedClient(c.generatedFile);
    const enriched = enrichGeneratedClientMethods(program, c.generatedFile, methods, className, blobBase);
    categories.push({
      id: c.id,
      title: c.title,
      members: [
        member({
          kind: 'client-class',
          name: className,
          ...(classSummary !== undefined ? { summary: classSummary } : {}),
          sourceFile: rel(c.generatedFile),
          members: enriched,
        }),
      ],
    });
  }

  const coreMembers = dedupeMembers(
    collectFromBarrel(path.join(REPO_ROOT, 'src/core/index.ts'), 'core', new Set())
  );
  categories.push({
    id: 'core',
    title: 'Core (runtime, auth, HTTP, WebSocket, config, errors, logging, types)',
    members: coreMembers.map((m) => ({ ...m, kind: m.kind.startsWith('core-') ? m.kind : `core-${m.kind}` })),
  });

  const utilsMembers = dedupeMembers(
    collectFromBarrel(path.join(REPO_ROOT, 'src/utils/index.ts'), 'utilities', new Set())
  );
  categories.push({
    id: 'utilities',
    title: 'Utilities (by package export)',
    members: utilsMembers.map((m) => ({
      ...m,
      kind: m.kind.startsWith('core-') ? m.kind.replace(/^core-/, 'util-') : `util-${m.kind}`,
    })),
  });

  categories.push({
    id: 'examples',
    title: 'Examples',
    members: listTsFiles(path.join(REPO_ROOT, 'examples')).map((f) => ({
      kind: 'example',
      name: path.basename(f, '.ts'),
      sourceFile: f,
    })),
  });

  categories.push({
    id: 'scripts',
    title: 'Repository scripts (tooling)',
    members: listTsFiles(path.join(REPO_ROOT, 'scripts')).map((f) => ({
      kind: 'script',
      name: path.basename(f, '.ts'),
      sourceFile: f,
    })),
  });

  const pkgMeta: ReferenceManifest['package'] = {
    name: pkg.name,
    version: pkg.version,
  };
  if (pkg.homepage !== undefined) pkgMeta.homepage = pkg.homepage;
  const repoUrl = pkg.repository?.url;
  if (repoUrl !== undefined) pkgMeta.repository = repoUrl;
  if (pkg.description !== undefined) pkgMeta.description = pkg.description;

  return {
    schemaVersion: SCHEMA_VERSION,
    package: pkgMeta,
    generatedAt: new Date().toISOString(),
    categories,
  };
}

function parseArgs(argv: string[]): { out?: string } {
  const outIdx = argv.indexOf('--out');
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : undefined;
  if (outPath !== undefined && outPath !== '') {
    return { out: outPath };
  }
  return {};
}

function main(): void {
  const { out } = parseArgs(process.argv.slice(2));
  const manifest = buildReferenceManifest();
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  if (out) {
    fs.mkdirSync(path.dirname(path.resolve(REPO_ROOT, out)), { recursive: true });
    fs.writeFileSync(path.resolve(REPO_ROOT, out), json, 'utf8');
  } else {
    process.stdout.write(json);
  }
}

if (require.main === module) {
  main();
}
