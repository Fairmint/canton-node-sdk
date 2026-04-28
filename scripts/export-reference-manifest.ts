#!/usr/bin/env tsx
/**
 * Builds a JSON reference manifest for web docs (@fairmint/canton-node-sdk public API).
 * Reads package.json, parses generated API client shims, walks core/utils barrels, lists examples/scripts.
 */
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_VERSION = 2 as const;
const GITHUB_BLOB_BASE = 'https://github.com/Fairmint/canton-node-sdk/blob/main';

type Transport = 'http' | 'websocket';

export interface ReferenceParam {
  name: string;
  type: string;
  optional?: boolean;
  rest?: boolean;
  description?: string;
}

export interface ReferenceMember {
  id?: string;
  kind: string;
  name: string;
  summary?: string;
  sourceFile?: string;
  sourceLine?: number;
  sourceUrl?: string;
  signature?: string;
  params?: ReferenceParam[];
  returnType?: string;
  parent?: string;
  receiver?: string;
  importPath?: string;
  category?: string;
  requirements?: string[];
  examples?: string[];
  operationClasses?: string[];
  transport?: Transport;
  /** Submembers (e.g. client methods) */
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
  functions: ReferenceMember[];
}

/** Satisfy `exactOptionalPropertyTypes` — omit keys when value is undefined */
function member(input: {
  id?: string | undefined;
  kind: string;
  name: string;
  summary?: string | undefined;
  sourceFile?: string | undefined;
  sourceLine?: number | undefined;
  sourceUrl?: string | undefined;
  signature?: string | undefined;
  params?: ReferenceParam[] | undefined;
  returnType?: string | undefined;
  parent?: string | undefined;
  receiver?: string | undefined;
  importPath?: string | undefined;
  category?: string | undefined;
  requirements?: string[] | undefined;
  examples?: string[] | undefined;
  operationClasses?: string[] | undefined;
  transport?: Transport | undefined;
  members?: ReferenceMember[] | undefined;
}): ReferenceMember {
  const m: ReferenceMember = { kind: input.kind, name: input.name };
  for (const key of [
    'id',
    'summary',
    'sourceFile',
    'sourceLine',
    'sourceUrl',
    'signature',
    'params',
    'returnType',
    'parent',
    'receiver',
    'importPath',
    'category',
    'requirements',
    'examples',
    'operationClasses',
    'transport',
    'members',
  ] as const) {
    const value = input[key];
    if (value !== undefined) {
      (m as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return m;
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


let cachedProgram: ts.Program | undefined;
let cachedChecker: ts.TypeChecker | undefined;

function createReferenceProgram(): ts.Program {
  if (cachedProgram) return cachedProgram;
  const configPath = ts.findConfigFile(REPO_ROOT, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) throw new Error('Unable to find tsconfig.json');
  const parsedConfig = ts.getParsedCommandLineOfConfigFile(configPath, {}, ts.sys as unknown as ts.ParseConfigFileHost);
  if (!parsedConfig) throw new Error('Unable to parse tsconfig.json');
  cachedProgram = ts.createProgram({ rootNames: parsedConfig.fileNames, options: parsedConfig.options });
  cachedChecker = cachedProgram.getTypeChecker();
  return cachedProgram;
}

function checker(): ts.TypeChecker {
  if (!cachedChecker) cachedChecker = createReferenceProgram().getTypeChecker();
  return cachedChecker;
}

function sourceInfo(node: ts.Node): { sourceFile: string; sourceLine: number; sourceUrl: string } {
  const sf = node.getSourceFile();
  const sourceFile = rel(sf.fileName);
  const sourceLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  return { sourceFile, sourceLine, sourceUrl: `${GITHUB_BLOB_BASE}/${sourceFile}#L${sourceLine}` };
}

function typeText(type: ts.Type, node: ts.Node): string {
  return checker().typeToString(
    type,
    node,
    ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope
  );
}

function docsFromSymbol(symbol: ts.Symbol | undefined): string | undefined {
  if (!symbol) return undefined;
  const text = ts.displayPartsToString(symbol.getDocumentationComment(checker())).trim();
  return text === '' ? undefined : text;
}

function paramDocs(sig: ts.Signature): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of sig.getJsDocTags()) {
    if (tag.name !== 'param' || !tag.text?.length) continue;
    const [first, ...rest] = tag.text.map((p) => p.text).join('').split(/\s+/);
    if (first) out.set(first, rest.join(' ').trim());
  }
  return out;
}

function signatureParams(sig: ts.Signature, node: ts.Node): ReferenceParam[] {
  const docs = paramDocs(sig);
  return sig.parameters.map((sym) => {
    const decl = sym.valueDeclaration;
    const optional = Boolean(
      decl && ((ts.isParameter(decl) && decl.questionToken !== undefined) || (ts.isPropertyDeclaration(decl) && decl.questionToken !== undefined))
    );
    const rest = Boolean(decl && ts.isParameter(decl) && decl.dotDotDotToken !== undefined);
    const p: ReferenceParam = { name: sym.getName(), type: typeText(checker().getTypeOfSymbolAtLocation(sym, decl ?? node), decl ?? node) };
    if (optional) p.optional = true;
    if (rest) p.rest = true;
    const desc = docs.get(sym.getName()) ?? docsFromSymbol(sym);
    if (desc) p.description = desc;
    return p;
  });
}

function callableFromSignature(input: {
  id: string;
  kind: string;
  name: string;
  parent?: string | undefined;
  receiver?: string | undefined;
  importPath: string;
  category: string;
  node: ts.Node;
  signature: ts.Signature;
  summary?: string | undefined;
  operationClasses?: string[] | undefined;
  transport?: Transport | undefined;
}): ReferenceMember {
  const ret = checker().getReturnTypeOfSignature(input.signature);
  const info = sourceInfo(input.node);
  return member({
    id: input.id,
    kind: input.kind,
    name: input.name,
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
    ...info,
    signature: `${input.name}${checker().signatureToString(input.signature, input.node, ts.TypeFormatFlags.NoTruncation)}`,
    params: signatureParams(input.signature, input.node),
    returnType: typeText(ret, input.node),
    ...(input.parent !== undefined ? { parent: input.parent } : {}),
    ...(input.receiver !== undefined ? { receiver: input.receiver } : {}),
    importPath: input.importPath,
    category: input.category,
    ...(input.operationClasses !== undefined ? { operationClasses: input.operationClasses } : {}),
    ...(input.transport !== undefined ? { transport: input.transport } : {}),
  });
}

function findClassDeclaration(filePath: string, name: string): ts.ClassDeclaration | undefined {
  const sf = createReferenceProgram().getSourceFile(filePath);
  let found: ts.ClassDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name?.text === name) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  if (sf) visit(sf);
  return found;
}

function publicMethodSignature(node: ts.MethodDeclaration | ts.ConstructorDeclaration): ts.Signature | undefined {
  const mods = ts.getCombinedModifierFlags(node);
  if (mods & ts.ModifierFlags.Private || mods & ts.ModifierFlags.Protected) return undefined;
  return checker().getSignatureFromDeclaration(node);
}

/** Parse generated client classes with the TypeScript checker for real params/returns. */
function parseGeneratedClient(generatedFile: string): {
  className: string;
  classSummary?: string;
  methods: ReferenceMember[];
} {
  const sf = createReferenceProgram().getSourceFile(generatedFile);
  const className = path.basename(generatedFile, '.generated.ts');
  const cls = findClassDeclaration(generatedFile, className);
  if (!sf || !cls) return { className, methods: [] };
  const classSummary = docsFromSymbol(checker().getSymbolAtLocation(cls.name ?? cls));
  const methods: ReferenceMember[] = [];

  for (const node of cls.members) {
    if (!ts.isPropertyDeclaration(node) || !ts.isIdentifier(node.name)) continue;
    const name = node.name.text;
    if (name.startsWith('_')) continue;
    const sig = checker().getTypeAtLocation(node).getCallSignatures()[0];
    if (!sig) continue;
    const declarationText = node.getText(sf).replace(/^public\s+/, '').replace(/;$/, '').trim();
    const ops = extractInstanceTypes(declarationText);
    const callable = callableFromSignature({
      id: `${className}.${name}`,
      kind: 'client-method',
      name,
      parent: className,
      receiver: `canton.${className.replace(/ApiClient$/, '').replace(/^LedgerJson$/, 'ledger').replace(/^Validator$/, 'validator').replace(/^Scan$/, 'scan')}`,
      importPath: '@fairmint/canton-node-sdk',
      category: className,
      node,
      signature: sig,
      summary: docsFromSymbol(checker().getSymbolAtLocation(node.name)),
      operationClasses: ops.length > 0 ? ops : undefined,
      transport: inferTransport(declarationText),
    });
    methods.push({ ...callable, signature: declarationText });
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
  const sf = createReferenceProgram().getSourceFile(tsPath);
  if (!sf) return [];
  const out: ReferenceMember[] = [];

  const addDeclaration = (node: ts.Node, kind: string, name: string, sig?: ts.Signature): void => {
    if (name.startsWith('_')) return;
    const symbol = 'name' in node && node.name ? checker().getSymbolAtLocation(node.name as ts.Node) : undefined;
    if (sig) {
      out.push(
        callableFromSignature({
          id: `${categoryLabel}.${name}`,
          kind: `core-${kind}`,
          name,
          importPath: '@fairmint/canton-node-sdk',
          category: categoryLabel,
          node,
          signature: sig,
          summary: docsFromSymbol(symbol),
        })
      );
      return;
    }
    const info = sourceInfo(node);
    out.push(
      member({
        id: `${categoryLabel}.${name}`,
        kind: `core-${kind}`,
        name,
        ...(docsFromSymbol(symbol) !== undefined ? { summary: docsFromSymbol(symbol) } : {}),
        ...info,
        parent: categoryLabel,
        importPath: '@fairmint/canton-node-sdk',
        category: categoryLabel,
      })
    );
  };

  for (const stmt of sf.statements) {
    const mods = ts.getCombinedModifierFlags(stmt as unknown as ts.Declaration);
    const exported = Boolean(mods & ts.ModifierFlags.Export) || ts.isExportDeclaration(stmt);
    if (!exported) continue;
    if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      const sig = checker().getSignatureFromDeclaration(stmt);
      addDeclaration(stmt, 'function', stmt.name.text, sig);
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      addDeclaration(stmt, 'class', stmt.name.text);
      for (const m of stmt.members) {
        if (!ts.isMethodDeclaration(m) || !ts.isIdentifier(m.name)) continue;
        const sig = publicMethodSignature(m);
        if (sig) {
          out.push(
            callableFromSignature({
              id: `${stmt.name.text}.${m.name.text}`,
              kind: 'method',
              name: m.name.text,
              parent: stmt.name.text,
              receiver: stmt.name.text,
              importPath: '@fairmint/canton-node-sdk',
              category: categoryLabel,
              node: m,
              signature: sig,
              summary: docsFromSymbol(checker().getSymbolAtLocation(m.name)),
            })
          );
        }
      }
    } else if ((ts.isInterfaceDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt) || ts.isEnumDeclaration(stmt)) && stmt.name) {
      addDeclaration(stmt, ts.isInterfaceDeclaration(stmt) ? 'interface' : ts.isTypeAliasDeclaration(stmt) ? 'type' : 'enum', stmt.name.text);
    } else if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const sig = checker().getTypeAtLocation(decl).getCallSignatures()[0];
        addDeclaration(decl, sig ? 'function' : 'const', decl.name.text, sig);
      }
    }
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
  const sf = createReferenceProgram().getSourceFile(cantonPath);
  const cls = findClassDeclaration(cantonPath, 'Canton');
  const members: ReferenceMember[] = [];

  if (sf) {
    for (const stmt of sf.statements) {
      if (ts.isInterfaceDeclaration(stmt) && stmt.name.text === 'CantonConfig') {
        for (const prop of stmt.members) {
          if (!ts.isPropertySignature(prop) || !ts.isIdentifier(prop.name)) continue;
          const info = sourceInfo(prop);
          members.push(
            member({
              id: `CantonConfig.${prop.name.text}`,
              kind: 'config-field',
              name: prop.name.text,
              ...(docsFromSymbol(checker().getSymbolAtLocation(prop.name)) !== undefined
                ? { summary: docsFromSymbol(checker().getSymbolAtLocation(prop.name)) }
                : {}),
              ...info,
              returnType: prop.type ? prop.type.getText(sf) : typeText(checker().getTypeAtLocation(prop), prop),
              parent: 'CantonConfig',
              importPath: '@fairmint/canton-node-sdk',
              category: 'Canton',
            })
          );
        }
      }
    }
  }

  if (cls) {
    const classSymbol = cls.name ? checker().getSymbolAtLocation(cls.name) : undefined;
    members.push(
      member({
        id: 'Canton',
        kind: 'class',
        name: 'Canton',
        ...(docsFromSymbol(classSymbol) !== undefined ? { summary: docsFromSymbol(classSymbol) } : {}),
        ...sourceInfo(cls),
        importPath: '@fairmint/canton-node-sdk',
        category: 'Canton',
      })
    );

    for (const node of cls.members) {
      if (ts.isConstructorDeclaration(node)) {
        const sig = publicMethodSignature(node);
        if (sig) {
          members.push(
            callableFromSignature({
              id: 'Canton.constructor',
              kind: 'constructor',
              name: 'constructor',
              parent: 'Canton',
              receiver: 'new Canton',
              importPath: '@fairmint/canton-node-sdk',
              category: 'Canton',
              node,
              signature: sig,
              summary: 'Create a Canton SDK facade with ledger, validator, scan, auth, and utility clients.',
            })
          );
        }
      }
      if (!ts.isMethodDeclaration(node) || !ts.isIdentifier(node.name)) continue;
      const sig = publicMethodSignature(node);
      if (!sig) continue;
      members.push(
        callableFromSignature({
          id: `Canton.${node.name.text}`,
          kind: 'method',
          name: node.name.text,
          parent: 'Canton',
          receiver: 'canton',
          importPath: '@fairmint/canton-node-sdk',
          category: 'Canton',
          node,
          signature: sig,
          summary: docsFromSymbol(checker().getSymbolAtLocation(node.name)),
        })
      );
    }
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

  createReferenceProgram();
  const categories: ReferenceCategory[] = [];

  categories.push({
    id: 'entry',
    title: 'Entry (Canton)',
    members: parseCantonEntry(),
  });

  for (const c of GENERATED_CLIENTS) {
    const { className, classSummary, methods } = parseGeneratedClient(c.generatedFile);
    categories.push({
      id: c.id,
      title: c.title,
      members: [
        member({
          kind: 'client-class',
          name: className,
          ...(classSummary !== undefined ? { summary: classSummary } : {}),
          sourceFile: rel(c.generatedFile),
          members: methods,
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

  const functions = categories
    .flatMap((c) => c.members.flatMap((m) => (m.members?.length ? m.members : [m])))
    .filter((m) => m.params !== undefined || m.returnType !== undefined)
    .sort((a, b) => (a.id ?? a.name).localeCompare(b.id ?? b.name));

  return {
    schemaVersion: SCHEMA_VERSION,
    package: pkgMeta,
    generatedAt: new Date().toISOString(),
    categories,
    functions,
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
