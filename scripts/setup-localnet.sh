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

# Determine repository root for writing env files
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCALNET_ENV_FILE="$REPO_ROOT/.env.localnet"

# Load env files to pick up tokens if not already exported
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

if [ -z "$SPLICE_GITHUB_TOKEN" ] && [ -z "$GITHUB_TOKEN" ]; then
    for env_file in "$REPO_ROOT/.env.localnet" "$REPO_ROOT/.env"; do
        load_env_file "$env_file"
        if [ -n "$SPLICE_GITHUB_TOKEN" ] || [ -n "$GITHUB_TOKEN" ]; then
            break
        fi
    done
fi

# Optional GitHub token for downloading private releases
AUTH_TOKEN="${SPLICE_GITHUB_TOKEN:-$GITHUB_TOKEN}"

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
    rm -f "$BUNDLE_FILE"

    if [ -n "$AUTH_TOKEN" ]; then
        echo "Using GitHub token for authenticated download"
    fi

    if command -v curl &> /dev/null; then
        CURL_OPTS=(-fL)
        if [ -n "$AUTH_TOKEN" ]; then
            CURL_OPTS+=(-H "Authorization: token $AUTH_TOKEN")
        fi
        CURL_OPTS+=("$DOWNLOAD_URL" -o "$BUNDLE_FILE")
        if ! curl "${CURL_OPTS[@]}"; then
            rm -f "$BUNDLE_FILE"
            echo -e "${RED}Error: Failed to download bundle from $DOWNLOAD_URL${NC}"
            echo "Verify your network access and permissions to the digital-asset/splice repository."
            echo "If the repository is private, set GITHUB_TOKEN or SPLICE_GITHUB_TOKEN with read access."
            exit 1
        fi
    elif command -v wget &> /dev/null; then
        WGET_OPTS=("$DOWNLOAD_URL" "-O" "$BUNDLE_FILE")
        if [ -n "$AUTH_TOKEN" ]; then
            WGET_OPTS=(--header="Authorization: token $AUTH_TOKEN" "${WGET_OPTS[@]}")
        fi
        if ! wget "${WGET_OPTS[@]}"; then
            rm -f "$BUNDLE_FILE"
            echo -e "${RED}Error: Failed to download bundle from $DOWNLOAD_URL${NC}"
            echo "Verify your network access and permissions to the digital-asset/splice repository."
            echo "If the repository is private, set GITHUB_TOKEN or SPLICE_GITHUB_TOKEN with read access."
            exit 1
        fi
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
