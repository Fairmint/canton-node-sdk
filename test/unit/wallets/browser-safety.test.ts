/**
 * The wallets module runs in browsers. At run time it may import only its own files and a short list of the SDK's
 * dependency-free modules (type-only imports are erased), and none of those may touch Node or DOM globals. The source
 * scan follows every runtime import, so an allowed module that later gains a Node import fails here. The emit checks
 * load the compiled entry point in a fresh Node process and confirm it requires nothing but relative files.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const SRC = path.resolve(__dirname, '../../../src');
const ROOT = path.join(SRC, 'wallets');
const BUILT_ENTRY = path.resolve(__dirname, '../../../build/src/wallets/index.js');

/**
 * SDK modules outside `src/wallets` the module may import at run time. Each must itself import nothing at run time but
 * other allowed modules (checked below).
 */
const ALLOWED_OUTSIDE = [
  'core/utils/type-guards.ts',
  'da-registry/templates.ts',
  'utils/token-standard/v1/constants.ts',
].map((file) => path.join(SRC, file));

/** The SDK's Node-only runtime dependencies; none may load with the wallets entry point. */
const NODE_ONLY_PACKAGES = ['axios', 'ws', 'pino', 'dotenv', 'glob'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Whether an import clause names only types: `type X`, or `{ type A, type B }` (each erased by the compiler). */
function clauseIsTypeOnly(typeKeyword: boolean, clause: string): boolean {
  if (typeKeyword) return true;
  const braces = /^\{([^}]*)\}$/.exec(clause.trim());
  if (!braces) return false;
  const names = (braces[1] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  return names.length > 0 && names.every((name) => name.startsWith('type '));
}

/** `import … from 'x'` / `export … from 'x'` statements, with whether they are type-only. */
function moduleSpecifiers(source: string): Array<{ specifier: string; typeOnly: boolean }> {
  const pattern =
    /^\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;
  const found: Array<{ specifier: string; typeOnly: boolean }> = [];
  for (const match of source.matchAll(pattern)) {
    const specifier = match[4] ?? match[5];
    if (specifier !== undefined) {
      found.push({ specifier, typeOnly: clauseIsTypeOnly(match[2] !== undefined, match[3] ?? '') });
    }
  }
  return found;
}

/** The `.ts` file a relative specifier names (`./x` → `x.ts` or `x/index.ts`). */
function resolveSource(from: string, specifier: string): string {
  const base = path.resolve(path.dirname(from), specifier);
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`${path.relative(SRC, from)}: cannot resolve ${specifier}`);
}

/** Problems with one file's runtime imports: anything not relative, or a relative file outside the allowed set. */
function importProblems(
  file: string,
  source: string = readFileSync(file, 'utf8')
): { problems: string[]; runtimeImports: string[] } {
  const problems: string[] = [];
  const runtimeImports: string[] = [];
  for (const { specifier, typeOnly } of moduleSpecifiers(source)) {
    if (typeOnly) continue;
    if (!/^\.\.?\//.test(specifier)) {
      problems.push(`imports package ${specifier}`);
      continue;
    }
    const resolved = resolveSource(file, specifier);
    if (!resolved.startsWith(`${ROOT}${path.sep}`) && !ALLOWED_OUTSIDE.includes(resolved)) {
      problems.push(`imports ${path.relative(SRC, resolved)}, which is not on the browser-safe list`);
      continue;
    }
    runtimeImports.push(resolved);
  }
  if (/\brequire\(/.test(source)) problems.push('calls require()');
  if (/\bimport\(/.test(source)) problems.push('uses a dynamic import()');
  return { problems, runtimeImports };
}

/** Every file reachable at run time from `entries`, following imports into the allowed SDK modules. */
function runtimeGraph(entries: readonly string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    queue.push(...importProblems(file).runtimeImports);
  }
  return [...seen].sort();
}

const walletFiles = sourceFiles(ROOT);
const graph = runtimeGraph(walletFiles);
const label = (file: string): string => path.relative(SRC, file);

/** Requires made while loading `entry` in a fresh Node process. */
function requiresWhileLoading(entry: string): string[] {
  const script = `
    const Module = require('module');
    const seen = [];
    const load = Module._load;
    Module._load = function (request, parent, isMain) {
      if (parent && parent.id !== '[eval]') seen.push(request);
      return load.apply(this, arguments);
    };
    require(${JSON.stringify(entry)});
    process.stdout.write(JSON.stringify(seen));
  `;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`node failed: ${result.stderr}`);
  return JSON.parse(result.stdout) as string[];
}

function expectOnlyRelativeRequires(requires: readonly string[]): void {
  expect(requires.length).toBeGreaterThan(0);
  for (const request of requires) {
    expect(request).toMatch(/^\.\.?\//);
  }
  for (const pkg of NODE_ONLY_PACKAGES) {
    expect(requires.some((request) => request === pkg || request.startsWith(`${pkg}/`))).toBe(false);
  }
}

describe('src/wallets browser safety', () => {
  it('has source files to check, and reaches only the allowed SDK modules outside src/wallets', () => {
    expect(walletFiles.length).toBeGreaterThan(5);
    expect(graph.filter((file) => !file.startsWith(`${ROOT}${path.sep}`)).map(label)).toEqual(
      ALLOWED_OUTSIDE.map(label).sort()
    );
  });

  it.each(graph.map((f) => [label(f), f]))('%s imports only browser-safe modules at run time', (_name, file) => {
    expect(importProblems(file).problems).toEqual([]);
  });

  it.each(graph.map((f) => [label(f), f]))('%s uses no Node or DOM globals', (_name, file) => {
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const forbidden of [
      /\bwindow\b/,
      /\bdocument\b/,
      /\blocalStorage\b/,
      /\bsessionStorage\b/,
      /\bprocess\./,
      /\bBuffer\b/,
      /\b__dirname\b/,
      /['"]node:/,
    ]) {
      expect(code).not.toMatch(forbidden);
    }
  });

  it('detects forbidden imports (scanner self-test)', () => {
    expect(moduleSpecifiers("import { Pool } from 'pg';")).toEqual([{ specifier: 'pg', typeOnly: false }]);
    expect(moduleSpecifiers("import type { X } from 'axios';")).toEqual([{ specifier: 'axios', typeOnly: true }]);
    expect(moduleSpecifiers("import { type A, type B } from '../x';")).toEqual([{ specifier: '../x', typeOnly: true }]);
    expect(moduleSpecifiers("import { type A, B } from '../x';")).toEqual([{ specifier: '../x', typeOnly: false }]);
    expect(moduleSpecifiers("export {\n  a,\n  b,\n} from './x';\nimport 'side-effect';")).toEqual([
      { specifier: './x', typeOnly: false },
      { specifier: 'side-effect', typeOnly: false },
    ]);
    expect(moduleSpecifiers("export * as W from './wallets';")).toEqual([{ specifier: './wallets', typeOnly: false }]);
  });

  it('refuses an SDK module outside the allowed list (scanner self-test)', () => {
    const probe = path.join(ROOT, 'probe.ts');
    expect(importProblems(probe, "import { ApiError } from '../core/errors';\n").problems).toEqual([
      'imports core/errors.ts, which is not on the browser-safe list',
    ]);
    expect(importProblems(probe, "import { type ApiError } from '../core/errors';\n").problems).toEqual([]);
    expect(importProblems(probe, "import axios from 'axios';\n").problems).toEqual(['imports package axios']);
  });
});

describe('src/wallets compiled entry point', () => {
  it('requires only relative files when compiled from source', () => {
    const outDir = mkdtempSync(path.join(os.tmpdir(), 'wallets-emit-'));
    try {
      const configPath = path.resolve(__dirname, '../../../tsconfig.json');
      const config = ts.getParsedCommandLineOfConfigFile(
        configPath,
        {},
        {
          ...ts.sys,
          onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
            throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
          },
        }
      );
      if (!config) throw new Error('cannot read tsconfig.json');
      const program = ts.createProgram([path.join(ROOT, 'index.ts')], {
        ...config.options,
        outDir,
        rootDir: SRC,
        declaration: false,
        declarationMap: false,
        sourceMap: false,
        noEmitOnError: true,
      });
      const emitted = program.emit();
      expect(emitted.emitSkipped).toBe(false);
      expectOnlyRelativeRequires(requiresWhileLoading(path.join(outDir, 'wallets/index.js')));
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  // `npm run build` produces the file; `npm run check:package-artifacts` checks it after every publish build too.
  (existsSync(BUILT_ENTRY) ? it : it.skip)('build/src/wallets/index.js requires only relative files', () => {
    expectOnlyRelativeRequires(requiresWhileLoading(BUILT_ENTRY));
  });
});
