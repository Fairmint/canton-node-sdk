#!/bin/bash
# =============================================================================
# Stop Splice LocalNet
# =============================================================================
# This script stops the Splice LocalNet services.
#
# Usage:
#   ./scripts/stop-localnet.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Stopping Splice LocalNet ===${NC}"

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

echo "Stopping LocalNet services..."
docker compose \
  --env-file "$LOCALNET_DIR/compose.env" \
  --env-file "$LOCALNET_DIR/env/common.env" \
  -f "$LOCALNET_DIR/compose.yaml" \
  -f "$LOCALNET_DIR/resource-constraints.yaml" \
  --profile sv \
  --profile app-provider \
  --profile app-user \
  down -v

echo ""
echo -e "${GREEN}✓ LocalNet stopped${NC}"
echo ""

