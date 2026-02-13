#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
QUICKSTART_DIR="${REPO_ROOT}/libs/cn-quickstart/quickstart"
DOCKERD_PID_FILE="/tmp/localnet-dockerd.pid"
DOCKERD_LOG_FILE="/tmp/localnet-dockerd.log"
HOSTS_ENTRY="127.0.0.1 scan.localhost sv.localhost wallet.localhost"

log() {
  printf '[localnet] %s\n' "$*"
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
    && command -v docker-compose >/dev/null 2>&1 \
    && docker compose version >/dev/null 2>&1; then
    return
  fi

  log "Installing Docker packages..."
  sudo apt-get update
  sudo apt-get install -y docker.io docker-compose docker-compose-v2
}

ensure_legacy_iptables() {
  if ! iptables --version | grep -q 'legacy'; then
    log "Switching iptables to legacy backend..."
    sudo update-alternatives --set iptables /usr/sbin/iptables-legacy
  fi

  if ! ip6tables --version | grep -q 'legacy'; then
    log "Switching ip6tables to legacy backend..."
    sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy
  fi
}

docker_ready() {
  docker info >/dev/null 2>&1 || sudo docker info >/dev/null 2>&1
}

start_docker_daemon() {
  if docker_ready; then
    sudo chmod 666 /var/run/docker.sock || true
    return
  fi

  log "Starting Docker daemon with vfs storage driver..."
  sudo nohup dockerd --host=unix:///var/run/docker.sock --pidfile="${DOCKERD_PID_FILE}" --storage-driver=vfs >"${DOCKERD_LOG_FILE}" 2>&1 &

  for _ in $(seq 1 60); do
    if sudo docker info >/dev/null 2>&1; then
      sudo chmod 666 /var/run/docker.sock || true
      return
    fi
    sleep 1
  done

  log "Docker failed to start. Inspect ${DOCKERD_LOG_FILE}."
  exit 1
}

ensure_submodules() {
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
  if ! grep -q 'scan\.localhost' /etc/hosts; then
    log "Adding localnet host aliases to /etc/hosts..."
    echo "${HOSTS_ENTRY}" | sudo tee -a /etc/hosts >/dev/null
  fi
}

quickstart_setup() {
  if [[ ! -f "${QUICKSTART_DIR}/.env.local" ]]; then
    log "Running cn-quickstart setup (OAuth2 enabled)..."
    (
      cd "${QUICKSTART_DIR}"
      printf 'y\ny\n\nn\n' | make setup
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

wait_for_services() {
  log "Waiting for Keycloak..."
  for _ in $(seq 1 30); do
    if curl -fsS http://localhost:8082/realms/AppProvider >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  if ! curl -fsS http://localhost:8082/realms/AppProvider >/dev/null 2>&1; then
    log "Keycloak did not become ready."
    exit 1
  fi

  log "Waiting for Validator API..."
  for _ in $(seq 1 30); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:3903/api/validator/v0/wallet/user-status || true)"
    if [[ "${code}" == "200" || "${code}" == "401" ]]; then
      break
    fi
    sleep 2
  done
  code="$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:3903/api/validator/v0/wallet/user-status || true)"
  if [[ "${code}" != "200" && "${code}" != "401" ]]; then
    log "Validator API did not become ready."
    exit 1
  fi

  log "Waiting for Scan API..."
  for _ in $(seq 1 30); do
    if curl -fsS http://scan.localhost:4000/api/scan/v0/dso-party-id >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
  if ! curl -fsS http://scan.localhost:4000/api/scan/v0/dso-party-id >/dev/null 2>&1; then
    log "Scan API did not become ready."
    exit 1
  fi

  log "All localnet services are ready."
}

start_localnet() {
  log "Starting cn-quickstart..."
  (
    cd "${QUICKSTART_DIR}"
    PATH="${HOME}/.daml/bin:${PATH}" make start
  )
  wait_for_services
}

stop_localnet() {
  if [[ ! -d "${QUICKSTART_DIR}" ]]; then
    log "cn-quickstart directory not found; nothing to stop."
    return
  fi

  log "Stopping cn-quickstart..."
  (
    cd "${QUICKSTART_DIR}"
    PATH="${HOME}/.daml/bin:${PATH}" make stop || true
  )
}

status_localnet() {
  if docker_ready; then
    log "Docker daemon is running."
  else
    log "Docker daemon is not running."
    exit 1
  fi

  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
  echo

  keycloak_ok="no"
  validator_ok="no"
  scan_ok="no"
  if curl -fsS http://localhost:8082/realms/AppProvider >/dev/null 2>&1; then
    keycloak_ok="yes"
  fi
  validator_code="$(curl -sS -o /dev/null -w '%{http_code}' http://localhost:3903/api/validator/v0/wallet/user-status || true)"
  if [[ "${validator_code}" == "200" || "${validator_code}" == "401" ]]; then
    validator_ok="yes"
  fi
  if curl -fsS http://scan.localhost:4000/api/scan/v0/dso-party-id >/dev/null 2>&1; then
    scan_ok="yes"
  fi

  printf 'Keycloak ready: %s\n' "${keycloak_ok}"
  printf 'Validator ready: %s (HTTP %s)\n' "${validator_ok}" "${validator_code:-n/a}"
  printf 'Scan ready: %s\n' "${scan_ok}"
}

run_smoke() {
  log "Building SDK core artifacts..."
  (
    cd "${REPO_ROOT}"
    npm run build:core
  )

  log "Running localnet smoke script..."
  (
    cd "${REPO_ROOT}"
    npm run example:connect
  )
}

run_integration_tests() {
  log "Running localnet integration tests..."
  (
    cd "${REPO_ROOT}"
    npm test -- test/integration/localnet
  )
}

do_prerequisites() {
  local require_curl="${1:-false}"

  require_command git
  if [[ "${require_curl}" == "true" ]]; then
    require_command curl
  fi
  ensure_sudo
  ensure_docker_packages
  ensure_legacy_iptables
  start_docker_daemon
  ensure_submodules
  ensure_hosts_entries
  quickstart_setup
}

usage() {
  cat <<'USAGE'
Usage: scripts/localnet-cloud.sh <command>

Commands:
  setup    Install prerequisites, init submodules, configure quickstart
  start    Start localnet and wait for ready endpoints
  stop     Stop localnet services
  status   Show docker + endpoint status
  smoke    Run example localnet connectivity script
  test     Run localnet integration tests
  verify   Run setup + start + smoke + test
USAGE
}

main() {
  if [[ "${1:-}" == "" ]]; then
    usage
    exit 1
  fi

  case "$1" in
    setup)
      do_prerequisites
      ;;
    start)
      do_prerequisites true
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
      run_smoke
      ;;
    test)
      run_integration_tests
      ;;
    verify)
      do_prerequisites true
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
