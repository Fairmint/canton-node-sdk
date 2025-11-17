#!/bin/bash
# =============================================================================
# Setup LocalNet from CN-Quickstart for Integration Testing
# =============================================================================
# This script clones the cn-quickstart repository and sets up the localnet
# module for integration testing the canton-node-sdk.
#
# Usage:
#   ./scripts/setup-quickstart-localnet.sh
#

set -e

# Determine repository root for writing env files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCALNET_ENV_FILE="$REPO_ROOT/.env.localnet"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== CN-Quickstart LocalNet Setup ===${NC}"

# Create temp directory if it doesn't exist
QUICKSTART_DIR="/tmp/cn-quickstart"
LOCALNET_DIR="$QUICKSTART_DIR/quickstart/docker/modules/localnet"

# Check if quickstart already exists
if [ -d "$QUICKSTART_DIR" ]; then
    echo -e "${YELLOW}CN-Quickstart already exists, pulling latest changes...${NC}"
    cd "$QUICKSTART_DIR"
    git pull origin main
else
    echo "Cloning CN-Quickstart repository..."
    git clone https://github.com/digital-asset/cn-quickstart.git "$QUICKSTART_DIR"
    echo -e "${GREEN}✓ Clone complete${NC}"
fi

# Verify the LocalNet directory exists
if [ ! -d "$LOCALNET_DIR" ]; then
    echo -e "${RED}Error: LocalNet directory not found at $LOCALNET_DIR${NC}"
    exit 1
fi

# Read the splice version from quickstart .env
QUICKSTART_ENV="$QUICKSTART_DIR/quickstart/.env"
if [ -f "$QUICKSTART_ENV" ]; then
    SPLICE_VERSION=$(grep "^SPLICE_VERSION=" "$QUICKSTART_ENV" | cut -d'=' -f2)
    echo "Detected Splice version: $SPLICE_VERSION"
else
    echo -e "${YELLOW}Warning: Could not find .env file, using default version${NC}"
    SPLICE_VERSION="0.4.17"
fi

# Persist environment variables to .env.localnet
TMP_ENV_FILE="$(mktemp)"
{
    if [ -f "$LOCALNET_ENV_FILE" ]; then
        grep -vE '^(LOCALNET_DIR|IMAGE_TAG)=' "$LOCALNET_ENV_FILE" || true
    fi
    echo "LOCALNET_DIR=\"$LOCALNET_DIR\""
    echo "IMAGE_TAG=\"$SPLICE_VERSION\""
} > "$TMP_ENV_FILE"
mv "$TMP_ENV_FILE" "$LOCALNET_ENV_FILE"

echo ""
echo "Updated environment file:"
echo "  $LOCALNET_ENV_FILE"
echo ""
echo "The LocalNet scripts will automatically load this file. To share the"
echo "configuration with other tooling, copy these entries into your project's"
echo ".env if needed."

echo ""
echo -e "${GREEN}=== LocalNet Setup Complete ===${NC}"
echo ""
echo "LocalNet directory: $LOCALNET_DIR"
echo "Splice version: $SPLICE_VERSION"
echo ""
echo "Environment variables saved:"
echo "  LOCALNET_DIR=\"$LOCALNET_DIR\""
echo "  IMAGE_TAG=\"$SPLICE_VERSION\""
echo ""
echo "Then use the following scripts:"
echo "  ./scripts/start-localnet.sh    # Start LocalNet"
echo "  ./scripts/stop-localnet.sh     # Stop LocalNet"
echo "  ./scripts/localnet-status.sh   # Check LocalNet status"
echo ""
