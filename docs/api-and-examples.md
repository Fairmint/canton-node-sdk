# API map and examples

The package deliberately exposes both low-level clients and higher-level helpers. The export list in
[`src/index.ts`](../src/index.ts) is the canonical public boundary.

## Clients

- `Canton` is the usual entrypoint and owns `ledger`, `validator`, and `scan` clients.
- `LedgerJsonApiClient` covers commands, active contracts, updates, parties, users, rights,
  packages, interactive submission, and completion streams.
- `ValidatorApiClient` covers Validator user, wallet, transfer, topology, traffic, ANS, and token
  standard operations.
- `ScanApiClient` covers public network, rules, holdings, rounds, rewards, traffic, and update
  queries.
- `CantonRuntime` supplies shared HTTP, authentication, configuration, and logging behavior.

Generated operation types and adjacent TSDoc are more reliable than a copied method catalog. Drill
down from [`src/clients/`](../src/clients/) and use IDE type information for the installed version.

## Higher-level helpers

Utilities under [`src/utils/`](../src/utils/) compose client operations for common flows:

- party creation and external-party onboarding;
- prepare-sign-execute external transactions;
- Amulet transfers and transfer preapproval;
- contract and transaction event parsing;
- mining-round and traffic-cost queries;
- polling and transaction batching.

These helpers still require the caller to supply the correct acting party, network-specific
identifiers, disclosure data, and authorization. Read each helper's input type and tests before
using it in a write path.

## Runnable examples

The maintained scripts under [`examples/`](../examples/) are the shortest end-to-end reference:

```bash
npx tsx examples/canton-quickstart.ts
npx tsx examples/localnet-with-oauth2.ts
npx tsx examples/create-party.ts alice 10
npx tsx examples/transfer-amulets.ts RECEIVER_PARTY_ID 5
npx tsx examples/external-signing.ts
npx tsx examples/scan-traffic-status.ts
```

Run them only against an environment where the configured identity is authorized to perform the
demonstrated operations. For more complex behavior, use [`test/integration/`](../test/integration/)
as executable documentation.
