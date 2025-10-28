#!/bin/bash
# =============================================================================
# Check Splice LocalNet Status
# =============================================================================
# This script checks the status of LocalNet services and their health.
#
# Usage:
#   ./scripts/localnet-status.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Splice LocalNet Status ===${NC}"

# Check for required environment variables
if [ -z "$LOCALNET_DIR" ]; then
    echo -e "${RED}Error: LOCALNET_DIR environment variable is not set${NC}"
    exit 1
fi

# Verify LocalNet directory exists
if [ ! -d "$LOCALNET_DIR" ]; then
    echo -e "${RED}Error: LocalNet directory not found at $LOCALNET_DIR${NC}"
    exit 1
fi

echo ""
echo "Container Status:"
echo "=================="
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
echo "Health Checks:"
echo "=============="

# Function to check endpoint health
check_endpoint() {
    local name=$1
    local url=$2

    if curl -f -s "$url" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $name: $url"
        return 0
    else
        echo -e "  ${RED}✗${NC} $name: $url"
        return 1
    fi
}

# Check JSON API endpoints
echo ""
echo "JSON API Endpoints:"
check_endpoint "App Provider" "http://localhost:39750/livez" || true
check_endpoint "App User" "http://localhost:29750/livez" || true
check_endpoint "Super Validator" "http://localhost:49750/livez" || true

echo ""
echo "Web UIs:"
check_endpoint "App Provider Wallet" "http://wallet.localhost:3000" || true
check_endpoint "App User Wallet" "http://wallet.localhost:2000" || true
check_endpoint "SV UI" "http://sv.localhost:4000" || true
check_endpoint "Scan UI" "http://scan.localhost:4000" || true

echo ""

