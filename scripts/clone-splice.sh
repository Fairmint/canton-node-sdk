#!/bin/bash

set -e

# Create artifacts directory
mkdir -p artifacts/splice

# Clone the splice repository
echo "Cloning splice repository..."
git clone --depth 1 --filter=blob:none --sparse https://github.com/hyperledger-labs/splice /tmp/splice

# Change to the cloned directory
cd /tmp/splice

# Set up sparse checkout for yaml files
echo "Setting up sparse checkout..."
git sparse-checkout set --no-cone '*.yaml'

# Copy openapi yaml files
echo "Copying openapi yaml files..."
find . -path '*/openapi/*' -name '*.yaml' ! -path '*/examples/*' | while read -r file; do
    target_dir="/Users/hardly/Documents/code/canton-node-sdk/artifacts/splice/$(dirname "$file")"
    mkdir -p "$target_dir"
    cp "$file" "$target_dir/"
done

# Copy openapi.yaml files
echo "Copying openapi.yaml files..."
find . -name 'openapi.yaml' ! -path '*/examples/*' | while read -r file; do
    target_dir="/Users/hardly/Documents/code/canton-node-sdk/artifacts/splice/$(dirname "$file")"
    mkdir -p "$target_dir"
    cp "$file" "$target_dir/"
done

# Clean up
echo "Cleaning up..."
cd /Users/hardly/Documents/code/canton-node-sdk
rm -rf /tmp/splice

echo "Splice artifacts cloned successfully!" 