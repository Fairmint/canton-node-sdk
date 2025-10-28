#!/bin/bash
# =============================================================================
# Setup Splice LocalNet for Development
# =============================================================================
# This script downloads and extracts the Splice LocalNet bundle for local
# development and testing.
#
# Usage:
#   ./scripts/setup-localnet.sh [version]
#
# Example:
#   ./scripts/setup-localnet.sh 0.4.22

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default version
SPLICE_VERSION="${1:-0.4.22}"

echo -e "${GREEN}=== Splice LocalNet Setup ===${NC}"
echo "Version: ${SPLICE_VERSION}"

# Create temp directory if it doesn't exist
TEMP_DIR="/tmp/splice-localnet"
mkdir -p "$TEMP_DIR"

# Change to temp directory
cd "$TEMP_DIR"

# Download the bundle if not already present
BUNDLE_FILE="${SPLICE_VERSION}_splice-node.tar.gz"
if [ -f "$BUNDLE_FILE" ]; then
    echo -e "${YELLOW}Bundle already exists, skipping download${NC}"
else
    echo "Downloading Splice LocalNet bundle..."
    DOWNLOAD_URL="https://github.com/digital-asset/splice/releases/download/v${SPLICE_VERSION}/${BUNDLE_FILE}"

    if command -v curl &> /dev/null; then
        curl -L "$DOWNLOAD_URL" -o "$BUNDLE_FILE"
    elif command -v wget &> /dev/null; then
        wget "$DOWNLOAD_URL" -O "$BUNDLE_FILE"
    else
        echo -e "${RED}Error: Neither curl nor wget is available${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ Download complete${NC}"
fi

# Extract the bundle if not already extracted
if [ -d "splice-node" ]; then
    echo -e "${YELLOW}Bundle already extracted, skipping extraction${NC}"
else
    echo "Extracting bundle..."
    tar xzf "$BUNDLE_FILE"
    echo -e "${GREEN}✓ Extraction complete${NC}"
fi

# Verify the LocalNet directory exists
LOCALNET_DIR="$TEMP_DIR/splice-node/docker-compose/localnet"
if [ ! -d "$LOCALNET_DIR" ]; then
    echo -e "${RED}Error: LocalNet directory not found at $LOCALNET_DIR${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}=== LocalNet Setup Complete ===${NC}"
echo ""
echo "LocalNet directory: $LOCALNET_DIR"
echo ""
echo "To use LocalNet, set these environment variables:"
echo ""
echo "  export LOCALNET_DIR=\"$LOCALNET_DIR\""
echo "  export IMAGE_TAG=\"$SPLICE_VERSION\""
echo ""
echo "Or add them to your shell profile:"
echo ""
echo "  echo 'export LOCALNET_DIR=\"$LOCALNET_DIR\"' >> ~/.bashrc"
echo "  echo 'export IMAGE_TAG=\"$SPLICE_VERSION\"' >> ~/.bashrc"
echo ""
echo "Then use the following scripts:"
echo "  ./scripts/start-localnet.sh    # Start LocalNet"
echo "  ./scripts/stop-localnet.sh     # Stop LocalNet"
echo "  ./scripts/localnet-status.sh   # Check LocalNet status"
echo ""

