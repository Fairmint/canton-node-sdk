#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="${CANTON_LOCALNET_PROJECT_ROOT:-$(pwd)}"
QUICKSTART_DIR="${REPO_ROOT}/libs/cn-quickstart/quickstart"
DOCKERD_PID_FILE="/tmp/localnet-dockerd.pid"
DOCKERD_LOG_FILE="/tmp/localnet-dockerd.log"
HOSTS_ENTRY="127.0.0.1 scan.localhost sv.localhost wallet.localhost"
CURL_CONNECT_TIMEOUT=2
CURL_MAX_TIME=5

log() {
  printf '[localnet] %s\n' "$*"
}

is_truthy() {
  case "${1,,}" in
    1 | true | yes | on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    log "Missing required command: ${cmd}"
    exit 1
  fi
}

ensure_sudo() {
  if ! sudo -n true >/dev/null 2>&1; then
    log "Passwordless sudo is required in this cloud environment."
    exit 1
  fi
}

ensure_docker_packages() {
  if command -v docker >/dev/null 2>&1 \
    && docker compose version >/dev/null 2>&1; then
    return
  fi

  log "Installing Docker packages..."
  sudo apt-get update
  sudo apt-get install -y docker.io docker-compose docker-compose-v2
}

ensure_legacy_iptables() {
  if ! command -v update-alternatives >/dev/null 2>&1 \
    || [[ ! -x /usr/sbin/iptables-legacy || ! -x /usr/sbin/ip6tables-legacy ]]; then
    log "iptables legacy binaries unavailable; skipping backend switch."
    return
  fi

  if ! iptables --version 2>/dev/null | grep -q 'legacy'; then
    log "Switching iptables to legacy backend..."
    sudo update-alternatives --set iptables /usr/sbin/iptables-legacy
  fi

  if ! ip6tables --version 2>/dev/null | grep -q 'legacy'; then
    log "Switching ip6tables to legacy backend..."
    sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy
  fi
}

docker_ready() {
  docker info >/dev/null 2>&1 || sudo docker info >/dev/null 2>&1
}

configure_docker_socket_permissions() {
  if [[ ! -S /var/run/docker.sock ]]; then
    return
  fi

  sudo groupadd -f docker >/dev/null 2>&1 || true
  sudo chown root:docker /var/run/docker.sock >/dev/null 2>&1 || true
  sudo chmod 660 /var/run/docker.sock || true
}

run_docker() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
    return
  fi
  sudo docker "$@"
}

resolve_quickstart_image_tag() {
  local env_file=""
  local splice_version=""
  local parsed_value=""

  for env_file in "${QUICKSTART_DIR}/.env" "${QUICKSTART_DIR}/.env.local"; do
    if [[ ! -f "${env_file}" ]]; then
      continue
    fi

    parsed_value="$(awk -F= -v key="SPLICE_VERSION" '
      $0 ~ /^[[:space:]]*#/ { next }
      $1 == key {
        value = substr($0, index($0, "=") + 1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
        gsub(/^"|"$/, "", value)
        gsub(/^'\''|'\''$/, "", value)
        parsed = value
      }
      END {
        if (parsed != "") {
          print parsed
        }
      }
    ' "${env_file}")"

    if [[ -n "${parsed_value}" ]]; then
      splice_version="${parsed_value}"
    fi
  done

  printf '%s' "${splice_version}"
}

run_quickstart_command() {
  local command="$1"
  local docker_shim_dir=""
  local quickstart_image_tag=""
  local status=0

  quickstart_image_tag="$(resolve_quickstart_image_tag)"

  if ! docker info >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
    docker_shim_dir="$(mktemp -d "/tmp/canton-localnet-docker-shim.XXXXXX")"
    cat >"${docker_shim_dir}/docker" <<'EOF'
#!/usr/bin/env bash
exec sudo -E docker "$@"
EOF
    chmod +x "${docker_shim_dir}/docker"
    log "Using sudo docker shim for quickstart command."
  fi

  set +e
  if [[ -n "${docker_shim_dir}" ]]; then
    (
      cd "${QUICKSTART_DIR}"
      MODULES_DIR="${QUICKSTART_DIR}/docker/modules" \
        LOCALNET_DIR="${QUICKSTART_DIR}/docker/modules/localnet" \
        IMAGE_TAG="${quickstart_image_tag}" \
        PATH="${docker_shim_dir}:${HOME}/.daml/bin:${PATH}" \
        bash -lc "${command}"
    )
    status=$?
  else
    (
      cd "${QUICKSTART_DIR}"
      MODULES_DIR="${QUICKSTART_DIR}/docker/modules" \
        LOCALNET_DIR="${QUICKSTART_DIR}/docker/modules/localnet" \
        IMAGE_TAG="${quickstart_image_tag}" \
        PATH="${HOME}/.daml/bin:${PATH}" \
        bash -lc "${command}"
    )
    status=$?
  fi
  set -e

  if [[ -n "${docker_shim_dir}" ]]; then
    rm -rf "${docker_shim_dir}"
  fi

  return "${status}"
}

run_quickstart_make() {
  local target="$1"
  run_quickstart_command "make ${target}"
}

start_docker_daemon() {
  local dockerd_pid=""

  if docker_ready; then
    configure_docker_socket_permissions
    return
  fi

  ensure_legacy_iptables

  log "Starting Docker daemon with vfs storage driver..."
  sudo nohup dockerd --host=unix:///var/run/docker.sock --pidfile="${DOCKERD_PID_FILE}" --storage-driver=vfs >"${DOCKERD_LOG_FILE}" 2>&1 &

  for _ in $(seq 1 60); do
    if sudo docker info >/dev/null 2>&1; then
      configure_docker_socket_permissions
      return
    fi
    if [[ -f "${DOCKERD_PID_FILE}" ]]; then
      dockerd_pid="$(cat "${DOCKERD_PID_FILE}" 2>/dev/null || true)"
      if [[ -n "${dockerd_pid}" ]] && ! ps -p "${dockerd_pid}" >/dev/null 2>&1; then
        log "Docker daemon exited before becoming ready."
        log "Inspect ${DOCKERD_LOG_FILE}."
        exit 1
      fi
    fi
    sleep 1
  done

  log "Docker failed to start. Inspect ${DOCKERD_LOG_FILE}."
  exit 1
}

ensure_submodules() {
  if [[ -d "${REPO_ROOT}/libs/splice" && -d "${QUICKSTART_DIR}" ]]; then
    return
  fi

  require_command git

  if ! git -C "${REPO_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log "Missing localnet assets and not in a git checkout. Install from npm with bundled assets or clone SDK with submodules."
    exit 1
  fi

  if [[ ! -d "${REPO_ROOT}/libs/splice" ]]; then
    log "Initializing libs/splice submodule..."
    git -C "${REPO_ROOT}" submodule update --init --depth 1 libs/splice
  fi

  if [[ ! -d "${REPO_ROOT}/libs/cn-quickstart" ]]; then
    log "Initializing libs/cn-quickstart submodule..."
    git -C "${REPO_ROOT}" submodule update --init --recursive libs/cn-quickstart
  fi

  if [[ ! -d "${QUICKSTART_DIR}" ]]; then
    log "cn-quickstart directory not found after submodule init."
    exit 1
  fi
}

ensure_hosts_entries() {
  if ! grep -Eq '(^|[[:space:]])scan\.localhost([[:space:]]|$)' /etc/hosts \
    || ! grep -Eq '(^|[[:space:]])sv\.localhost([[:space:]]|$)' /etc/hosts \
    || ! grep -Eq '(^|[[:space:]])wallet\.localhost([[:space:]]|$)' /etc/hosts; then
    log "Adding localnet host aliases to /etc/hosts..."
    echo "${HOSTS_ENTRY}" | sudo tee -a /etc/hosts >/dev/null
  fi
}

quickstart_setup() {
  if [[ ! -f "${QUICKSTART_DIR}/.env.local" ]]; then
    log "Running cn-quickstart setup (OAuth2 enabled)..."
    (
      cd "${QUICKSTART_DIR}"
      # Match CI behavior first, then fall back to prompt-based answers for newer setup flows.
      echo "2" | make setup || true
      if ! grep -Eq '^AUTH_MODE=oauth2$' "${QUICKSTART_DIR}/.env.local" 2>/dev/null; then
        printf 'y\ny\n\nn\n' | make setup
      fi
    )
  else
    log "Reusing existing ${QUICKSTART_DIR}/.env.local."
  fi

  if [[ ! -x "${HOME}/.daml/bin/daml" ]]; then
    log "Installing Daml SDK..."
    (
      cd "${QUICKSTART_DIR}"
      make install-daml-sdk
    )
  else
    log "Reusing existing Daml SDK at ${HOME}/.daml/bin/daml."
  fi
}

quickstart_fast_start_enabled() {
  is_truthy "${CANTON_LOCALNET_FAST_START:-true}"
}

quickstart_force_full_start() {
  is_truthy "${CANTON_LOCALNET_FORCE_FULL_START:-false}"
}

quickstart_build_artifacts_ready() {
  local missing_paths=()

  if [[ ! -f "${QUICKSTART_DIR}/backend/build/distributions/backend.tar" ]]; then
    missing_paths+=("backend/build/distributions/backend.tar")
  fi

  if [[ ! -d "${QUICKSTART_DIR}/frontend/dist" ]]; then
    missing_paths+=("frontend/dist")
  fi

  if ! compgen -G "${QUICKSTART_DIR}/daml/licensing/.daml/dist/*.dar" >/dev/null; then
    missing_paths+=("daml/licensing/.daml/dist/*.dar")
  fi

  if ! compgen -G "${QUICKSTART_DIR}/backend/build/otel-agent/opentelemetry-javaagent-*.jar" >/dev/null; then
    missing_paths+=("backend/build/otel-agent/opentelemetry-javaagent-*.jar")
  fi

  if [[ ${#missing_paths[@]} -gt 0 ]]; then
    log "Fast start unavailable; missing quickstart build artifacts: ${missing_paths[*]}"
    return 1
  fi

  return 0
}

extract_quickstart_compose_up_command() {
  (
    cd "${QUICKSTART_DIR}"
    make -n start 2>/dev/null | awk '/docker compose .* up -d --no-recreate/{line=$0} END{print line}'
  )
}

try_fast_start_localnet() {
  local compose_up_command=""

  compose_up_command="$(extract_quickstart_compose_up_command)"
  if [[ -z "${compose_up_command}" ]]; then
    log "Unable to determine quickstart compose startup command."
    return 1
  fi

  log "Starting cn-quickstart with fast path (skip quickstart rebuild)..."
  run_quickstart_command "${compose_up_command}"
}

wait_for_services() {
  log "Waiting for Keycloak..."
  for _ in $(seq 1 30); do
    if curl --connect-timeout "${CURL_CONNECT_TIMEOUT}" --max-time "${CURL_MAX_TIME}" -fsS http://localhost:8082/realms/AppProvider >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  if ! curl --connect-timeout "${CURL_CONNECT_TIMEOUT}" --max-time "${CURL_MAX_TIME}" -fsS http://localhost:8082/realms/AppProvider >/dev/null 2>&1; then
    log "Keycloak did not become ready."
    exit 1
  fi

  log "Waiting for Validator API..."
  for _ in $(seq 1 30); do
    code="$(curl --connect-timeout "${CURL_CONNECT_TIMEOUT}" --max-time "${CURL_MAX_TIME}" -sS -o /dev/null -w '%{http_code}' http://localhost:3903/api/validator/v0/wallet/user-status || true)"
    if [[ "${code}" == "200" || "${code}" == "401" ]]; then
      break
    fi
    sleep 2
  done
  code="$(curl --connect-timeout "${CURL_CONNECT_TIMEOUT}" --max-time "${CURL_MAX_TIME}" -sS -o /dev/null -w '%{http_code}' http://localhost:3903/api/validator/v0/wallet/user-status || true)"
  if [[ "${code}" != "200" && "${code}" != "401" ]]; then
    log "Validator API did not become ready."
    exit 1
  fi

  log "Waiting for Scan API..."
  for _ in $(seq 1 30); do
    if curl --connect-timeout "${CURL_CONNECT_TIMEOUT}" --max-time "${CURL_MAX_TIME}" -fsS http://scan.localhost:4000/api/scan/v0/dso-party-id >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  if ! curl --connect-timeout "${CURL_CONNECT_TIMEOUT}" --max-time "${CURL_MAX_TIME}" -fsS http://scan.localhost:4000/api/scan/v0/dso-party-id >/dev/null 2>&1; then
    log "Scan API did not become ready."
    exit 1
  fi

  log "All localnet services are ready."
}

start_localnet() {
  if quickstart_force_full_start; then
    log "Forcing full cn-quickstart start (CANTON_LOCALNET_FORCE_FULL_START=true)."
    run_quickstart_make start
    wait_for_services
    return
  fi

  if quickstart_fast_start_enabled && quickstart_build_artifacts_ready; then
    if try_fast_start_localnet; then
      wait_for_services
      return
    fi
    log "Fast start failed; falling back to full cn-quickstart start."
  fi

  log "Starting cn-quickstart with full build..."
  run_quickstart_make start
  wait_for_services
}

stop_localnet() {
  if [[ ! -d "${QUICKSTART_DIR}" ]]; then
    log "cn-quickstart directory not found; nothing to stop."
    stop_managed_dockerd
    return
  fi

  log "Stopping cn-quickstart..."
  run_quickstart_make stop || true
  stop_managed_dockerd
}

stop_managed_dockerd() {
  local pid=""
  local cmd=""

  if [[ ! -f "${DOCKERD_PID_FILE}" ]]; then
    return
  fi

  pid="$(cat "${DOCKERD_PID_FILE}" 2>/dev/null || true)"
  if [[ -z "${pid}" ]]; then
    rm -f "${DOCKERD_PID_FILE}" "${DOCKERD_LOG_FILE}"
    return
  fi

  if ! ps -p "${pid}" >/dev/null 2>&1; then
    rm -f "${DOCKERD_PID_FILE}" "${DOCKERD_LOG_FILE}"
    return
  fi

  cmd="$(ps -p "${pid}" -o comm= 2>/dev/null | tr -d '[:space:]')"
  if [[ "${cmd}" != "dockerd" ]]; then
    log "PID ${pid} is not dockerd; skipping daemon cleanup."
    rm -f "${DOCKERD_PID_FILE}"
    return
  fi

  if ! sudo -n true >/dev/null 2>&1; then
    log "Cannot stop managed dockerd without passwordless sudo."
    return
  fi

  log "Stopping managed dockerd (pid ${pid})..."
  sudo kill -TERM "${pid}" >/dev/null 2>&1 || true
  for _ in $(seq 1 10); do
    if ! ps -p "${pid}" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  if ps -p "${pid}" >/dev/null 2>&1; then
    sudo kill -KILL "${pid}" >/dev/null 2>&1 || true
  fi
  rm -f "${DOCKERD_PID_FILE}" "${DOCKERD_LOG_FILE}"
}

status_localnet() {
  if docker_ready; then
    log "Docker daemon is running."
  else
    log "Docker daemon is not running."
    exit 1
  fi

  run_docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  echo

  keycloak_ok="no"
  validator_ok="no"
  scan_ok="no"
  if curl --connect-timeout "${CURL_CONNECT_TIMEOUT}" --max-time "${CURL_MAX_TIME}" -fsS http://localhost:8082/realms/AppProvider >/dev/null 2>&1; then
    keycloak_ok="yes"
  fi
  validator_code="$(curl --connect-timeout "${CURL_CONNECT_TIMEOUT}" --max-time "${CURL_MAX_TIME}" -sS -o /dev/null -w '%{http_code}' http://localhost:3903/api/validator/v0/wallet/user-status || true)"
  if [[ "${validator_code}" == "200" || "${validator_code}" == "401" ]]; then
    validator_ok="yes"
  fi
  if curl --connect-timeout "${CURL_CONNECT_TIMEOUT}" --max-time "${CURL_MAX_TIME}" -fsS http://scan.localhost:4000/api/scan/v0/dso-party-id >/dev/null 2>&1; then
    scan_ok="yes"
  fi

  printf 'Keycloak ready: %s\n' "${keycloak_ok}"
  printf 'Validator ready: %s (HTTP %s)\n' "${validator_ok}" "${validator_code:-n/a}"
  printf 'Scan ready: %s\n' "${scan_ok}"
}

run_smoke() {
  local validator_code=""

  log "Running localnet smoke checks..."

  if ! curl --connect-timeout "${CURL_CONNECT_TIMEOUT}" --max-time "${CURL_MAX_TIME}" -fsS http://localhost:8082/realms/AppProvider >/dev/null 2>&1; then
    log "Keycloak is not reachable."
    exit 1
  fi

  validator_code="$(curl --connect-timeout "${CURL_CONNECT_TIMEOUT}" --max-time "${CURL_MAX_TIME}" -sS -o /dev/null -w '%{http_code}' http://localhost:3903/api/validator/v0/wallet/user-status || true)"
  if [[ "${validator_code}" != "200" && "${validator_code}" != "401" ]]; then
    log "Validator API is not reachable (HTTP ${validator_code})."
    exit 1
  fi

  if ! curl --connect-timeout "${CURL_CONNECT_TIMEOUT}" --max-time "${CURL_MAX_TIME}" -fsS http://scan.localhost:4000/api/scan/v0/dso-party-id >/dev/null 2>&1; then
    log "Scan API is not reachable."
    exit 1
  fi

  log "Smoke checks passed."
}

read_npm_script() {
  local target_dir="$1"
  local script_name="$2"

  if [[ ! -f "${target_dir}/package.json" ]]; then
    return
  fi

  node -e 'const fs=require("fs"); const pkgPath=process.argv[1]; const scriptName=process.argv[2]; try { const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")); const script = pkg?.scripts?.[scriptName]; if (typeof script === "string") process.stdout.write(script); } catch {}' "${target_dir}/package.json" "${script_name}"
}

script_is_recursive_localnet_test() {
  local script_value="$1"
  echo "${script_value}" | grep -Eq '(^|[[:space:]])(canton-localnet[[:space:]]+test|[^[:space:]]*localnet-cloud\.sh[[:space:]]+test)([[:space:]]|$)'
}

run_integration_tests() {
  local script_value=""

  if [[ -n "${CANTON_LOCALNET_TEST_CMD:-}" ]]; then
    log "Running custom integration command from CANTON_LOCALNET_TEST_CMD..."
    (
      cd "${PROJECT_ROOT}"
      bash -lc "${CANTON_LOCALNET_TEST_CMD}"
    )
    return
  fi

  script_value="$(read_npm_script "${PROJECT_ROOT}" "test:integration")"
  if [[ -n "${script_value}" ]]; then
    if script_is_recursive_localnet_test "${script_value}"; then
      log "Skipping recursive test:integration script."
    else
      log "Running project integration tests: npm run test:integration"
      (
        cd "${PROJECT_ROOT}"
        npm run test:integration
      )
      return
    fi
  fi

  script_value="$(read_npm_script "${PROJECT_ROOT}" "test:localnet")"
  if [[ -n "${script_value}" ]]; then
    if script_is_recursive_localnet_test "${script_value}"; then
      log "Skipping recursive test:localnet script."
    else
      log "Running project integration tests: npm run test:localnet"
      (
        cd "${PROJECT_ROOT}"
        npm run test:localnet
      )
      return
    fi
  fi

  if [[ "${PROJECT_ROOT}" == "${REPO_ROOT}" && -d "${REPO_ROOT}/test/integration/localnet" && -d "${REPO_ROOT}/node_modules" ]]; then
    log "Running bundled SDK localnet integration tests..."
    (
      cd "${REPO_ROOT}"
      npm test -- test/integration/localnet
    )
    return
  fi

  log "No integration test command configured; skipping test step."
}

usage() {
  cat <<'USAGE'
Usage: scripts/localnet/localnet-cloud.sh <command>

Commands:
  setup    Install prerequisites, init submodules, configure quickstart
  start    Start localnet and wait for ready endpoints
  stop     Stop localnet services
  status   Show docker + endpoint status
  smoke    Run endpoint smoke checks
  test     Run project integration tests (if configured)
  verify   Run setup + start + smoke + test

Environment:
  CANTON_LOCALNET_FAST_START=true|false       Enable fast startup path (default: true)
  CANTON_LOCALNET_FORCE_FULL_START=true|false Force full startup with rebuild
USAGE
}

main() {
  if [[ "${1:-}" == "" ]]; then
    usage
    exit 1
  fi

  case "$1" in
    setup)
      ensure_sudo
      ensure_docker_packages
      start_docker_daemon
      ensure_submodules
      ensure_hosts_entries
      quickstart_setup
      ;;
    start)
      require_command curl
      ensure_sudo
      ensure_docker_packages
      start_docker_daemon
      ensure_submodules
      ensure_hosts_entries
      quickstart_setup
      start_localnet
      ;;
    stop)
      stop_localnet
      ;;
    status)
      require_command curl
      status_localnet
      ;;
    smoke)
      require_command curl
      run_smoke
      ;;
    test)
      run_integration_tests
      ;;
    verify)
      require_command curl
      ensure_sudo
      ensure_docker_packages
      start_docker_daemon
      ensure_submodules
      ensure_hosts_entries
      quickstart_setup
      start_localnet
      run_smoke
      run_integration_tests
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
