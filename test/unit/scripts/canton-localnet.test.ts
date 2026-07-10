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
