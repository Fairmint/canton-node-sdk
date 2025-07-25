# Client Generation Scripts

This directory contains scripts for automatically generating TypeScript client files from operation definitions.

## Overview

The client generation system automatically creates client files (`LedgerJsonApiClient.ts` and `ValidatorApiClient.ts`) from templates by scanning operation files and generating the necessary method declarations, type imports, and implementations.

## How It Works

1. **Templates**: Each client has a `.template.ts` file that defines the structure with placeholders
2. **Operation Scanning**: The script scans the operations directories for files using `createApiOperation`
3. **Code Generation**: Method declarations, implementations, and imports are automatically generated
4. **Output**: Complete client files are written (and added to `.gitignore` to prevent manual edits)

## Usage

To regenerate the client files:
```bash
npm run generate:clients
# or
yarn generate:clients
```

This command is automatically run as part of the build process.

## Adding New Operations

1. Create a new operation file in the appropriate operations directory
2. Use the `createApiOperation` helper with proper type parameters
3. Run `npm run generate:clients` to update the client files

## Modifying Client Structure

To modify the client structure:
1. Edit the appropriate `.template.ts` file
2. Update the generation script if new placeholders are needed
3. Run the generation script to apply changes

## Template Files

- `src/clients/ledger-json-api/LedgerJsonApiClient.template.ts` - Template for the Ledger JSON API client
- `src/clients/validator-api/ValidatorApiClient.template.ts` - Template for the Validator API client

## Generated Files

The following files are auto-generated and should not be edited manually:
- `src/clients/ledger-json-api/LedgerJsonApiClient.ts`
- `src/clients/validator-api/ValidatorApiClient.ts`

These files are in `.gitignore` to prevent accidental manual modifications.