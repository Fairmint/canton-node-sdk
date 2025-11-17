#!/bin/bash
# =============================================================================
# Start Splice LocalNet
# =============================================================================
# This script starts the Splice LocalNet services using Docker Compose.
#
# Prerequisites:
#   - Run ./scripts/setup-localnet.sh first
#   - Set LOCALNET_DIR and IMAGE_TAG environment variables
#
# Usage:
#   ./scripts/start-localnet.sh

set -e

# Determine repository root for locating env files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

load_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    echo "Loading environment variables from $env_file"
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

# Load environment variables from .env files if needed
if [ -z "$LOCALNET_DIR" ] || [ -z "$IMAGE_TAG" ]; then
  declare -a ENV_FILES=()
  if [ -n "$LOCALNET_ENV_FILE" ]; then
    ENV_FILES+=("$LOCALNET_ENV_FILE")
  fi
  ENV_FILES+=("$REPO_ROOT/.env.localnet" "$REPO_ROOT/.env")

  for env_file in "${ENV_FILES[@]}"; do
    load_env_file "$env_file"
    if [ -n "$LOCALNET_DIR" ] && [ -n "$IMAGE_TAG" ]; then
      break
    fi
  done
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Starting Splice LocalNet ===${NC}"

# Check for required environment variables
if [ -z "$LOCALNET_DIR" ]; then
    echo -e "${RED}Error: LOCALNET_DIR environment variable is not set${NC}"
    echo "Run ./scripts/setup-localnet.sh first and set the environment variables"
    exit 1
fi

if [ -z "$IMAGE_TAG" ]; then
    echo -e "${RED}Error: IMAGE_TAG environment variable is not set${NC}"
    echo "Run ./scripts/setup-localnet.sh first and set the environment variables"
    exit 1
fi

# Verify LocalNet directory exists
if [ ! -d "$LOCALNET_DIR" ]; then
    echo -e "${RED}Error: LocalNet directory not found at $LOCALNET_DIR${NC}"
    echo "Run ./scripts/setup-localnet.sh first"
    exit 1
fi

# Verify compose files exist
if [ ! -f "$LOCALNET_DIR/compose.yaml" ]; then
    echo -e "${RED}Error: compose.yaml not found in $LOCALNET_DIR${NC}"
    exit 1
fi

echo "Configuration:"
echo "  LOCALNET_DIR: $LOCALNET_DIR"
echo "  IMAGE_TAG: $IMAGE_TAG"
echo ""

# Start LocalNet services
echo "Starting LocalNet services..."
docker compose \
  --env-file "$LOCALNET_DIR/compose.env" \
  --env-file "$LOCALNET_DIR/env/common.env" \
  -f "$LOCALNET_DIR/compose.yaml" \
  -f "$LOCALNET_DIR/resource-constraints.yaml" \
  --profile sv \
  --profile app-provider \
  --profile app-user \
  up -d

echo ""
echo -e "${GREEN}✓ LocalNet services started${NC}"
echo ""
echo "Waiting for services to be ready..."
sleep 10

# Check service status
echo ""
echo "Service status:"
docker compose \
  --env-file "$LOCALNET_DIR/compose.env" \
  --env-file "$LOCALNET_DIR/env/common.env" \
  -f "$LOCALNET_DIR/compose.yaml" \
  -f "$LOCALNET_DIR/resource-constraints.yaml" \
  --profile sv \
  --profile app-provider \
  --profile app-user \
  ps

echo ""
echo -e "${GREEN}=== LocalNet is running ===${NC}"
echo ""
echo "Access the LocalNet services:"
echo "  - App User Wallet UI:   http://wallet.localhost:2000"
echo "  - App Provider Wallet:  http://wallet.localhost:3000"
echo "  - SV Web UI:            http://sv.localhost:4000"
echo "  - Scan Web UI:          http://scan.localhost:4000"
echo ""
echo "API Endpoints:"
echo "  - App Provider JSON API:  http://localhost:39750"
echo "  - App User JSON API:      http://localhost:29750"
echo "  - SV JSON API:            http://localhost:49750"
echo ""
echo "To stop LocalNet:"
echo "  ./scripts/stop-localnet.sh"
echo ""
echo "To check logs:"
echo "  docker compose -f $LOCALNET_DIR/compose.yaml logs -f [service-name]"
echo ""
