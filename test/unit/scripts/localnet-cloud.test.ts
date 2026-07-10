import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../../..');

function runSourcedLocalnetScript(body: string, args: readonly string[] = []): string {
  return execFileSync('bash', ['-c', `source scripts/localnet-cloud.sh\n${body}`, 'localnet-cloud-test', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

describe('localnet-cloud configuration lifecycle', () => {
  it('persists a pending forced-snapshot restart across setup and start processes', () => {
    const quickstart = mkdtempSync(resolve(tmpdir(), 'canton-localnet-config-'));
    const localnet = resolve(quickstart, 'docker/modules/localnet');
    const cantonConfig = resolve(localnet, 'conf/canton/app.conf');
    const spliceConfig = resolve(localnet, 'conf/splice/sv/app.conf');
    const cantonHealthcheck = resolve(localnet, 'docker/canton/health-check.sh');
    const spliceHealthcheck = resolve(localnet, 'docker/splice/health-check.sh');

    mkdirSync(resolve(localnet, 'conf/canton'), { recursive: true });
    mkdirSync(resolve(localnet, 'conf/splice/sv'), { recursive: true });
    mkdirSync(resolve(localnet, 'docker/canton'), { recursive: true });
    mkdirSync(resolve(localnet, 'docker/splice'), { recursive: true });
    writeFileSync(cantonConfig, 'canton {}\n');
    writeFileSync(spliceConfig, 'canton {}\n');
    writeFileSync(cantonHealthcheck, '#!/bin/bash\n');
    writeFileSync(spliceHealthcheck, '#!/bin/bash\n');
    writeFileSync(resolve(quickstart, '.env.local'), 'AUTH_MODE=oauth2\n');

    try {
      const setupOutput = runSourcedLocalnetScript(
        'QUICKSTART_DIR="$1"\n' + 'configure_quickstart_localnet\n' + 'printf "%s\\n" "${SPLICE_CONFIG_CHANGED}"',
        [quickstart]
      );
      const startOutput = runSourcedLocalnetScript(
        'QUICKSTART_DIR="$1"\n' +
          'configure_quickstart_localnet\n' +
          'printf "pending:%s\\n" "${SPLICE_CONFIG_CHANGED}"\n' +
          'quickstart_force_full_start() { return 1; }\n' +
          'quickstart_infra_only_enabled() { return 0; }\n' +
          'splice_container_running() { return 0; }\n' +
          "start_infra_only_localnet() { printf 'start-infra\\n'; }\n" +
          'run_infra_compose() { printf \'recreate:%s\\n\' "$1"; }\n' +
          "wait_for_services() { printf 'wait\\n'; }\n" +
          'start_localnet\n' +
          'printf "applied:%s:%s\\n" "${SPLICE_CONFIG_CHANGED}" "$(quickstart_env_value "${SPLICE_CONFIG_PENDING_KEY}")"',
        [quickstart]
      );

      expect(setupOutput.trim()).toBe('true');
      expect(startOutput.trim().split('\n')).toEqual([
        'pending:true',
        'start-infra',
        '[localnet] Recreating the running Splice service to apply updated LocalNet configuration.',
        'recreate:up -d --no-deps --force-recreate splice',
        'wait',
        'applied:false:false',
      ]);
      const configured = readFileSync(spliceConfig, 'utf8');
      expect(configured.match(/canton\.scan-apps\.scan-app\.enable-forced-acs-snapshots = true/g)).toHaveLength(1);
    } finally {
      rmSync(quickstart, { recursive: true, force: true });
    }
  });

  it('recreates a previously running Splice service after infra-only startup and before readiness', () => {
    const output = runSourcedLocalnetScript(`
quickstart_force_full_start() { return 1; }
quickstart_infra_only_enabled() { return 0; }
splice_container_running() { return 0; }
start_infra_only_localnet() { printf 'start-infra\\n'; }
run_infra_compose() { printf 'recreate:%s\\n' "$1"; }
wait_for_services() { printf 'wait\\n'; }
set_quickstart_env_value() { :; }
SPLICE_CONFIG_CHANGED=true
start_localnet
`);

    expect(output.trim().split('\n')).toEqual([
      'start-infra',
      '[localnet] Recreating the running Splice service to apply updated LocalNet configuration.',
      'recreate:up -d --no-deps --force-recreate splice',
      'wait',
    ]);
  });

  it('recreates a previously running Splice service after fast startup and before readiness', () => {
    const output = runSourcedLocalnetScript(`
quickstart_force_full_start() { return 1; }
quickstart_infra_only_enabled() { return 1; }
quickstart_fast_start_enabled() { return 0; }
quickstart_build_artifacts_ready() { return 0; }
try_fast_start_localnet() { printf 'start-fast\\n'; }
splice_container_running() { return 0; }
run_infra_compose() { printf 'recreate:%s\\n' "$1"; }
wait_for_services() { printf 'wait\\n'; }
set_quickstart_env_value() { :; }
SPLICE_CONFIG_CHANGED=true
start_localnet
`);

    expect(output.trim().split('\n')).toEqual([
      'start-fast',
      '[localnet] Recreating the running Splice service to apply updated LocalNet configuration.',
      'recreate:up -d --no-deps --force-recreate splice',
      'wait',
    ]);
  });

  it('does not recreate Splice for a fresh stack or unchanged configuration', () => {
    const output = runSourcedLocalnetScript(`
quickstart_force_full_start() { return 1; }
quickstart_infra_only_enabled() { return 0; }
start_infra_only_localnet() { printf 'start-infra\\n'; }
run_infra_compose() { printf 'unexpected-recreate:%s\\n' "$1"; }
wait_for_services() { printf 'wait\\n'; }
set_quickstart_env_value() { :; }

splice_container_running() { return 1; }
SPLICE_CONFIG_CHANGED=true
start_localnet

splice_container_running() { return 0; }
SPLICE_CONFIG_CHANGED=false
start_localnet
`);

    expect(output.trim().split('\n')).toEqual(['start-infra', 'wait', 'start-infra', 'wait']);
  });
});
