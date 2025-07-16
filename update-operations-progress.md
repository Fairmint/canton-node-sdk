# OpenAPI Types Migration Progress

## Overview
Migration to use generated OpenAPI types instead of manual schemas for all API operations.

## Pattern Established
```typescript
import type { paths } from '../../../../../generated/openapi-types';

// Type aliases for better readability
type RequestType = paths['/v2/endpoint']['post']['requestBody']['content']['application/json'];
type ResponseType = paths['/v2/endpoint']['post']['responses']['200']['content']['application/json'];

// Keep existing parameter schemas for backward compatibility
export const OperationParamsSchema = z.object({
  // ... existing structure
});

export const Operation = createApiOperation<
  OperationParams,
  ResponseType // Use existing response schemas for now
>({
  paramsSchema: OperationParamsSchema,
  method: 'POST',
  buildUrl: (params, apiUrl) => `${apiUrl}/v2/endpoint`,
  buildRequestData: (params, client): RequestType => {
    // Map params to generated request type
    return { ... };
  },
});
```

## Completed Migrations

### Ledger JSON API v2 Operations
- ✅ `/v2/commands/submit-and-wait` - submit-and-wait.ts
- ✅ `/v2/version` - version/get.ts  
- ✅ `/v2/packages` - packages/get.ts, packages/post.ts
- ✅ `/v2/packages/{package-id}/status` - packages/get-package-status.ts
- ✅ `/v2/parties` - parties/get.ts, parties/post.ts
- ✅ `/v2/parties/participant-id` - parties/get-participant-id.ts
- ✅ `/v2/users` - users/create-user.ts, users/delete-user.ts, users/list-users.ts

## Remaining Operations

### Ledger JSON API v2 Operations
- ⏳ `/v2/authenticated-user` - authenticated-user/get.ts (NOT IN OPENAPI SPEC)
- ⏳ `/v2/commands/async/submit` - commands/async/submit.ts
- ⏳ `/v2/commands/async/submit-reassignment` - commands/async/submit-reassignment.ts
- ⏳ `/v2/commands/submit-and-wait-for-transaction` - commands/submit-and-wait-for-transaction.ts
- ⏳ `/v2/commands/submit-and-wait-for-transaction-tree` - commands/submit-and-wait-for-transaction-tree.ts
- ⏳ `/v2/commands/submit-and-wait-for-reassignment` - commands/submit-and-wait-for-reassignment.ts
- ⏳ `/v2/commands/completions` - commands/completions.ts
- ⏳ `/v2/events/events-by-contract-id` - events/get-events-by-contract-id.ts (ALREADY DONE BY USER)
- ⏳ `/v2/idps` - idps/get.ts, idps/post.ts
- ⏳ `/v2/idps/{idp-id}` - idps/get-idp.ts, idps/delete-idp.ts, idps/patch-idp.ts
- ⏳ `/v2/interactive-submission/*` - interactive-submission/allocate-party.ts, create-user.ts, upload-dar.ts
- ⏳ `/v2/packages/get-preferred-package-version` - packages/get-preferred-package-version.ts
- ⏳ `/v2/packages/get-preferred-packages` - packages/get-preferred-packages.ts
- ⏳ `/v2/parties/{party}` - parties/get-party-details.ts, parties/update-party-details.ts
- ⏳ `/v2/state/*` - state/get-active-contracts.ts, get-connected-synchronizers.ts, get-latest-pruned-offsets.ts, get-ledger-end.ts
- ⏳ `/v2/updates/*` - updates/get-flats.ts, get-transaction-by-id.ts, get-transaction-by-offset.ts, get-transaction-tree-by-id.ts, get-transaction-tree-by-offset.ts, get-trees.ts, get-update-by-id.ts, get-update-by-offset.ts
- ⏳ `/v2/users/{user-id}` - users/get-user.ts, users/update-user.ts
- ⏳ `/v2/users/{user-id}/rights` - users/grant-user-rights.ts, users/list-user-rights.ts, users/revoke-user-rights.ts
- ⏳ `/v2/users/{user-id}/identity-provider-id` - users/update-user-identity-provider.ts

### Validator API v0 Operations
- ⏳ `/api/validator/v0/admin/*` - admin/create-user.ts, admin/get-external-party-balance.ts
- ⏳ `/api/validator/v0/ans/*` - ans/create-entry.ts, ans/get-rules.ts, ans/list-entries-proxy.ts, ans/lookup-by-name.ts, ans/lookup-by-party.ts
- ⏳ `/api/validator/v0/scan-proxy/*` - scan-proxy/get-amulet-rules.ts, get-dso-party-id.ts, get-mining-round-details.ts, etc.
- ⏳ `/api/validator/v0/wallet/*` - wallet/get-amulets.ts, get-balance.ts, get-user-status.ts, buy-traffic-requests/*, token-standard/*, transfer-offers/*
- ⏳ `/api/validator/v0/register` - register.ts

## Current Issues to Resolve
1. **Build Errors**: TypeScript compilation errors due to type mismatches
2. **Client Compatibility**: Auto-generated client expects specific parameter structures
3. **Missing Endpoints**: Some operations don't exist in current OpenAPI spec
4. **Schema Validation**: Generated schemas are stricter than manual ones

## Next Steps
1. Fix remaining TypeScript errors in completed migrations
2. Complete remaining Ledger JSON API operations
3. Start Validator API operations (these may need separate OpenAPI spec)
4. Remove redundant schema files once all operations are migrated
5. Update build process to ensure compatibility

## Files That Can Be Deleted After Migration
- `src/clients/ledger-json-api/schemas/operations/*.ts` (partial)
- `src/clients/ledger-json-api/schemas/api/*.ts` (partial - keep response types initially)
- `src/clients/validator-api/schemas/operations/*.ts` (after validator API migration)
- `src/clients/validator-api/schemas/api/*.ts` (after validator API migration)