import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../..');

function runPackagedLocalnetWithVersion(version: string): string {
  const packageRoot = mkdtempSync(resolve(tmpdir(), 'canton-localnet-bin-'));
  const localnetBin = resolve(packageRoot, 'bin/canton-localnet');

  mkdirSync(resolve(packageRoot, 'bin'), { recursive: true });
  mkdirSync(resolve(packageRoot, 'libs/splice'), { recursive: true });
  mkdirSync(resolve(packageRoot, 'scripts'), { recursive: true });
  copyFileSync(resolve(REPO_ROOT, 'bin/canton-localnet'), localnetBin);
  chmodSync(localnetBin, 0o755);
  writeFileSync(resolve(packageRoot, 'libs/splice/VERSION'), version);
  writeFileSync(resolve(packageRoot, 'scripts/localnet-cloud.sh'), 'printf "%s" "${CANTON_LOCALNET_SPLICE_VERSION}"\n');

  try {
    return execFileSync(localnetBin, ['status'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CANTON_LOCALNET_SPLICE_VERSION: '',
        // Keep unit coverage on the deprecated SDK fallback path.
        CANTON_LOCALNET_FORCE_LEGACY: '1',
      },
    });
  } finally {
    rmSync(packageRoot, { recursive: true, force: true });
  }
}

describe('canton-localnet Splice version selection', (): void => {
  it('uses a non-empty trimmed packaged version', (): void => {
    expect(runPackagedLocalnetWithVersion('  1.2.3 \n')).toBe('1.2.3');
  });

  it('falls back to the built-in version when the packaged version is blank', (): void => {
    expect(runPackagedLocalnetWithVersion(' \n\t')).toBe('0.6.8');
  });
});

describe('canton-localnet soft delegation', (): void => {
  it('delegates to @fairmint/canton-dev-tools when that package is installed nearby', (): void => {
    const packageRoot = mkdtempSync(resolve(tmpdir(), 'canton-localnet-delegate-'));
    const localnetBin = resolve(packageRoot, 'bin/canton-localnet');
    const devToolsBin = resolve(packageRoot, 'node_modules/@fairmint/canton-dev-tools/bin/canton-dev-tools');

    mkdirSync(resolve(packageRoot, 'bin'), { recursive: true });
    mkdirSync(resolve(packageRoot, 'scripts'), { recursive: true });
    mkdirSync(resolve(devToolsBin, '..'), { recursive: true });
    copyFileSync(resolve(REPO_ROOT, 'bin/canton-localnet'), localnetBin);
    chmodSync(localnetBin, 0o755);
    writeFileSync(resolve(packageRoot, 'scripts/localnet-cloud.sh'), 'printf "legacy\\n"\n');
    writeFileSync(devToolsBin, '#!/usr/bin/env bash\nprintf "dev-tools:%s\\n" "$*"\n');
    chmodSync(devToolsBin, 0o755);

    try {
      const output = execFileSync(localnetBin, ['status'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          CANTON_LOCALNET_FORCE_LEGACY: '',
        },
      });
      expect(output.trim()).toBe('dev-tools:status');
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });

  it('keeps the legacy path when CANTON_LOCALNET_FORCE_LEGACY=1', (): void => {
    const packageRoot = mkdtempSync(resolve(tmpdir(), 'canton-localnet-force-legacy-'));
    const localnetBin = resolve(packageRoot, 'bin/canton-localnet');
    const devToolsBin = resolve(packageRoot, 'node_modules/@fairmint/canton-dev-tools/bin/canton-dev-tools');

    mkdirSync(resolve(packageRoot, 'bin'), { recursive: true });
    mkdirSync(resolve(packageRoot, 'scripts'), { recursive: true });
    mkdirSync(resolve(devToolsBin, '..'), { recursive: true });
    copyFileSync(resolve(REPO_ROOT, 'bin/canton-localnet'), localnetBin);
    chmodSync(localnetBin, 0o755);
    writeFileSync(resolve(packageRoot, 'scripts/localnet-cloud.sh'), 'printf "legacy\\n"\n');
    writeFileSync(devToolsBin, '#!/usr/bin/env bash\nprintf "dev-tools\\n"\n');
    chmodSync(devToolsBin, 0o755);

    try {
      const output = execFileSync(localnetBin, ['status'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          CANTON_LOCALNET_FORCE_LEGACY: '1',
        },
      });
      expect(output.trim()).toBe('legacy');
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });

  it('applies CANTON_LOCALNET_INFRA_ONLY=true before soft-delegation', (): void => {
    const packageRoot = mkdtempSync(resolve(tmpdir(), 'canton-localnet-infra-default-'));
    const localnetBin = resolve(packageRoot, 'bin/canton-localnet');
    const devToolsBin = resolve(packageRoot, 'node_modules/@fairmint/canton-dev-tools/bin/canton-dev-tools');

    mkdirSync(resolve(packageRoot, 'bin'), { recursive: true });
    mkdirSync(resolve(packageRoot, 'scripts'), { recursive: true });
    mkdirSync(resolve(devToolsBin, '..'), { recursive: true });
    copyFileSync(resolve(REPO_ROOT, 'bin/canton-localnet'), localnetBin);
    chmodSync(localnetBin, 0o755);
    writeFileSync(resolve(packageRoot, 'scripts/localnet-cloud.sh'), 'printf "legacy\\n"\n');
    writeFileSync(devToolsBin, '#!/usr/bin/env bash\nprintf "infra:%s\\n" "${CANTON_LOCALNET_INFRA_ONLY}"\n');
    chmodSync(devToolsBin, 0o755);

    try {
      const output = execFileSync(localnetBin, ['status'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          CANTON_LOCALNET_FORCE_LEGACY: '',
          // Unset so the package binary must supply the documented default.
          CANTON_LOCALNET_INFRA_ONLY: '',
        },
      });
      expect(output.trim()).toBe('infra:true');
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });

  it('preserves an explicit CANTON_LOCALNET_INFRA_ONLY override on soft-delegation', (): void => {
    const packageRoot = mkdtempSync(resolve(tmpdir(), 'canton-localnet-infra-override-'));
    const localnetBin = resolve(packageRoot, 'bin/canton-localnet');
    const devToolsBin = resolve(packageRoot, 'node_modules/@fairmint/canton-dev-tools/bin/canton-dev-tools');

    mkdirSync(resolve(packageRoot, 'bin'), { recursive: true });
    mkdirSync(resolve(packageRoot, 'scripts'), { recursive: true });
    mkdirSync(resolve(devToolsBin, '..'), { recursive: true });
    copyFileSync(resolve(REPO_ROOT, 'bin/canton-localnet'), localnetBin);
    chmodSync(localnetBin, 0o755);
    writeFileSync(resolve(packageRoot, 'scripts/localnet-cloud.sh'), 'printf "legacy\\n"\n');
    writeFileSync(devToolsBin, '#!/usr/bin/env bash\nprintf "infra:%s\\n" "${CANTON_LOCALNET_INFRA_ONLY}"\n');
    chmodSync(devToolsBin, 0o755);

    try {
      const output = execFileSync(localnetBin, ['status'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          CANTON_LOCALNET_FORCE_LEGACY: '',
          CANTON_LOCALNET_INFRA_ONLY: 'false',
        },
      });
      expect(output.trim()).toBe('infra:false');
    } finally {
      rmSync(packageRoot, { recursive: true, force: true });
    }
  });
});
