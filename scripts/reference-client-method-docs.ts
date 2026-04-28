/**
 * Resolves generated client shim types into human-readable docs using the TypeScript program.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

export interface DocParam {
  readonly name: string;
  readonly type: string;
  readonly optional?: boolean;
}

export interface ClientMethodDocs {
  readonly signature: string;
  readonly implementationSignature: string;
  readonly params?: DocParam[];
  readonly returnType?: string;
  readonly inputSummary: string;
  readonly returnSummary: string;
  readonly operationClasses: string[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseClientValueImports(clientSource: string, clientFileAbs: string): Map<string, string> {
  const map = new Map<string, string>();
  const fromDir = path.dirname(clientFileAbs);
  const lineRe = /^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/;
  for (const line of clientSource.split('\n')) {
    if (/^\s*import\s+type\s+/.test(line)) continue;
    const m = line.match(lineRe);
    if (!m?.[1] || !m[2]) continue;
    const spec = m[2];
    const resolved = path.resolve(fromDir, spec);
    const cands = [`${resolved}.ts`, path.join(resolved, 'index.ts')];
    let abs: string | undefined;
    for (const c of cands) {
      if (fs.existsSync(c)) {
        abs = c;
        break;
      }
    }
    if (!abs) continue;
    const parts = m[1].split(',');
    for (const p of parts) {
      const raw = p.trim();
      if (!raw || raw.startsWith('//')) continue;
      const noType = raw.replace(/^\s*type\s+/, '');
      const name = noType.split(/\s+as\s+/)[0]?.trim();
      if (name) map.set(name, abs);
    }
  }
  return map;
}

export function uniqueOps(ops: string[]): string[] {
  return [...new Set(ops)];
}

function findExportedOpType(
  program: ts.Program,
  checker: ts.TypeChecker,
  opFileAbs: string,
  opName: string
): ts.Type | undefined {
  const sf = program.getSourceFile(path.normalize(opFileAbs));
  if (!sf) return undefined;
  let found: ts.Type | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === opName) {
      found = checker.getTypeAtLocation(node.name);
    } else if (ts.isClassDeclaration(node) && node.name?.text === opName) {
      const s = checker.getSymbolAtLocation(node.name);
      if (s) found = checker.getDeclaredTypeOfSymbol(s);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function getInstanceMethodAppType(
  checker: ts.TypeChecker,
  opCtorType: ts.Type,
  method: 'execute' | 'subscribe' | 'connect'
): ts.Type | undefined {
  const cs = opCtorType.getConstructSignatures()[0];
  const instanceType = cs ? cs.getReturnType() : opCtorType;
  const prop = checker.getPropertyOfType(instanceType, method);
  if (!prop) return undefined;
  const decl = prop.valueDeclaration ?? prop.declarations?.[0];
  if (decl) return checker.getTypeOfSymbolAtLocation(prop, decl);
  return checker.getTypeOfSymbol(prop);
}

function shortenType(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function p0tFromSym(checker: ts.TypeChecker, firstP: ts.Symbol): ts.Type {
  const decl = firstP.valueDeclaration ?? firstP.declarations?.[0];
  return decl ? checker.getTypeOfSymbolAtLocation(firstP, decl) : checker.getTypeOfSymbol(firstP);
}

function typeLooksEmptyRequest(checker: ts.TypeChecker, t: ts.Type): boolean {
  const s = checker.typeToString(t).replace(/\s+/g, '');
  if (t.flags & ts.TypeFlags.Void) return true;
  if (s === 'Record<string,never>' || s === '{}' || s === 'undefined') return true;
  if (s === 'never') return true;
  const props = checker.getPropertiesOfType(t);
  return props.length === 0 && !t.getStringIndexType() && !t.getNumberIndexType();
}

function expandObjectParams(
  checker: ts.TypeChecker,
  paramType: ts.Type,
  maxFields: number
): DocParam[] | undefined {
  const props = checker.getPropertiesOfType(paramType);
  if (props.length === 0) return undefined;
  const out: DocParam[] = [];
  for (const p of props.slice(0, maxFields)) {
    const decl = p.valueDeclaration ?? p.declarations?.[0];
    const pt = decl ? checker.getTypeOfSymbolAtLocation(p, decl) : checker.getTypeOfSymbol(p);
    const optional = (p.getFlags() & ts.SymbolFlags.Optional) !== 0;
    const row: DocParam = optional
      ? {
          name: p.getName(),
          type: checker.typeToString(pt, undefined, ts.TypeFormatFlags.NoTruncation),
          optional: true,
        }
      : {
          name: p.getName(),
          type: checker.typeToString(pt, undefined, ts.TypeFormatFlags.NoTruncation),
        };
    out.push(row);
  }
  return out;
}

function buildInputParts(
  checker: ts.TypeChecker,
  firstParam: ts.Symbol | undefined,
  wsStyle: 'none' | 'subscribe',
  subscribeSecondParam: ts.Symbol | undefined
): { docParams: DocParam[]; inputSummary: string; paramLabelForSignature: string } {
  if (!firstParam) {
    return { docParams: [], inputSummary: 'No parameters', paramLabelForSignature: '' };
  }
  const decl = firstParam.valueDeclaration ?? firstParam.declarations?.[0];
  const pType = decl
    ? checker.getTypeOfSymbolAtLocation(firstParam, decl)
    : checker.getTypeOfSymbol(firstParam);

  if (typeLooksEmptyRequest(checker, pType)) {
    return { docParams: [], inputSummary: 'No parameters', paramLabelForSignature: '' };
  }

  const expanded = expandObjectParams(checker, pType, 48);
  if (expanded && expanded.length > 0) {
    const bits = expanded.map((r) => `${r.name}${r.optional ? '?' : ''}: ${shortenType(r.type, 48)}`);
    let inputSummary = bits.join(', ');
    if (wsStyle === 'subscribe' && subscribeSecondParam) {
      const d2 =
        subscribeSecondParam.valueDeclaration ?? subscribeSecondParam.declarations?.[0];
      const hType = d2
        ? checker.getTypeOfSymbolAtLocation(subscribeSecondParam, d2)
        : checker.getTypeOfSymbol(subscribeSecondParam);
      const hStr = shortenType(checker.typeToString(hType), 80);
      inputSummary = `${inputSummary}; handlers: ${hStr}`;
    }
    const inner = expanded.map((r) => `${r.name}${r.optional ? '?' : ''}: ${r.type}`).join('; ');
    const paramLabelForSignature =
      wsStyle === 'subscribe'
        ? `params: { ${inner} }, handlers: WebSocketHandlers<…>`
        : `params: { ${inner} }`;
    return { docParams: expanded, inputSummary, paramLabelForSignature };
  }

  const raw = checker.typeToString(pType, undefined, ts.TypeFormatFlags.NoTruncation);
  const docParams: DocParam[] = [{ name: 'params', type: raw }];
  let inputSummary = shortenType(raw, 140);
  let paramLabelForSignature = `params: ${raw}`;
  if (wsStyle === 'subscribe' && subscribeSecondParam) {
    const d2 =
      subscribeSecondParam.valueDeclaration ?? subscribeSecondParam.declarations?.[0];
    const hType = d2
      ? checker.getTypeOfSymbolAtLocation(subscribeSecondParam, d2)
      : checker.getTypeOfSymbol(subscribeSecondParam);
    const hStr = checker.typeToString(hType, undefined, ts.TypeFormatFlags.NoTruncation);
    paramLabelForSignature = `params: ${raw}, handlers: ${hStr}`;
    inputSummary = `${inputSummary}; handlers: ${shortenType(hStr, 80)}`;
  }
  return { docParams, inputSummary, paramLabelForSignature };
}

export function resolveClientMethodDocs(
  program: ts.Program,
  importMap: Map<string, string>,
  input: {
    readonly methodName: string;
    readonly implementationSignature: string;
    readonly operationNames: string[];
    readonly transport: 'http' | 'websocket';
    readonly clientShimTail: string;
  }
): ClientMethodDocs | undefined {
  const checker = program.getTypeChecker();
  const opName = input.operationNames[0];
  if (!opName) return undefined;
  const opFile = importMap.get(opName);
  if (!opFile) return undefined;

  const opCtorType = findExportedOpType(program, checker, opFile, opName);
  if (!opCtorType) return undefined;

  const transport = input.transport;
  const shim = input.clientShimTail;
  const opMethod: 'execute' | 'subscribe' | 'connect' =
    transport === 'websocket'
      ? shim.includes("['connect']")
        ? 'connect'
        : 'subscribe'
      : 'execute';
  const methodApp = getInstanceMethodAppType(checker, opCtorType, opMethod);
  if (!methodApp) return undefined;

  const callSigs = methodApp.getCallSignatures();
  const sig0 = callSigs[0];
  if (!sig0) return undefined;

  const params = sig0.getParameters();
  const retType = sig0.getReturnType();

  const firstP = params[0];
  const wsStyle: 'none' | 'subscribe' = opMethod === 'subscribe' ? 'subscribe' : 'none';
  const secondP = wsStyle === 'subscribe' ? params[1] : undefined;

  const { docParams, inputSummary, paramLabelForSignature } = buildInputParts(
    checker,
    firstP,
    wsStyle,
    secondP
  );

  const returnFull = checker.typeToString(retType, undefined, ts.TypeFormatFlags.NoTruncation);
  const returnSummary = shortenType(returnFull, 160);

  let argsForReadable: string;
  if (transport === 'websocket' && opMethod === 'subscribe') {
    const d0 = firstP?.valueDeclaration ?? firstP?.declarations?.[0];
    const p0t =
      firstP && d0 ? checker.getTypeOfSymbolAtLocation(firstP, d0) : firstP ? checker.getTypeOfSymbol(firstP) : undefined;
    const d1 = secondP?.valueDeclaration ?? secondP?.declarations?.[0];
    const p1t =
      secondP && d1
        ? checker.getTypeOfSymbolAtLocation(secondP, d1)
        : secondP
          ? checker.getTypeOfSymbol(secondP)
          : undefined;
    const a = p0t ? checker.typeToString(p0t, undefined, ts.TypeFormatFlags.NoTruncation) : '';
    const b = p1t ? checker.typeToString(p1t, undefined, ts.TypeFormatFlags.NoTruncation) : '';
    argsForReadable =
      p0t && p1t ? `params: ${a}, handlers: ${b}` : paramLabelForSignature || `${a}, ${b}`;
  } else if (!firstP || typeLooksEmptyRequest(checker, p0tFromSym(checker, firstP))) {
    argsForReadable = '';
  } else {
    argsForReadable = paramLabelForSignature || `params: ${checker.typeToString(p0tFromSym(checker, firstP), undefined, ts.TypeFormatFlags.NoTruncation)}`;
  }

  const readableSig = `${input.methodName}(${argsForReadable}): ${returnFull}`;

  return {
    signature: readableSig,
    implementationSignature: input.implementationSignature,
    ...(docParams.length > 0 ? { params: docParams } : {}),
    returnType: returnFull,
    inputSummary,
    returnSummary,
    operationClasses: uniqueOps(input.operationNames),
  };
}

const formatHost: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: (f) => f,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => '\n',
};

export function createSdkProgram(repoRoot: string): ts.Program {
  const configPath = ts.findConfigFile(repoRoot, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) {
    throw new Error('tsconfig.json not found');
  }
  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) {
    throw new Error(ts.formatDiagnostic(readResult.error, formatHost));
  }
  const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, path.dirname(configPath));
  const programOptions: ts.CreateProgramOptions = {
    rootNames: parsed.fileNames,
    options: parsed.options,
  };
  if (parsed.projectReferences !== undefined) {
    programOptions.projectReferences = parsed.projectReferences;
  }
  return ts.createProgram(programOptions);
}

/** When TypeScript resolution fails, still emit stable human text (no `Parameters<InstanceType<…>>`). */
export function fallbackClientMethodDocs(input: {
  readonly methodName: string;
  readonly implementationSignature: string;
  readonly operationNames: string[];
  readonly transport: 'http' | 'websocket';
}): ClientMethodDocs {
  const op = input.operationNames[0] ?? 'Operation';
  const retLabel = `${op} response`;
  return {
    signature:
      input.transport === 'websocket'
        ? `${input.methodName}(params, handlers): Promise<WebSocketSubscription>`
        : `${input.methodName}(params): Promise<unknown>`,
    implementationSignature: input.implementationSignature,
    inputSummary:
      input.transport === 'websocket'
        ? `WebSocket params for ${op} plus message handlers`
        : `Request object for ${op} (see operation module in SDK source).`,
    returnSummary:
      input.transport === 'websocket' ? 'Active WebSocketSubscription' : `Promise<${retLabel}>`,
    operationClasses: uniqueOps(input.operationNames),
  };
}

export function findPublicMethodLine(content: string, methodName: string): number | undefined {
  const re = new RegExp(`^\\s*public\\s+${escapeRegex(methodName)}!`, 'm');
  const match = re.exec(content);
  if (!match || match.index === undefined) return undefined;
  return content.slice(0, match.index).split('\n').length;
}
