# LocalNet testing

Read the public [LocalNet guide](https://github.com/Fairmint/canton-node-sdk/wiki/LocalNet-testing)
first.

**ENG-1635:** `@fairmint/canton-dev-tools@0.1.7+` owns LocalNet lifecycle, pins, and shared test
helpers. This repository does not ship LocalNet scripts or a `canton-localnet` binary.

- Commands: `npm run localnet:*` (wired to `canton-dev-tools`) or
  `npx @fairmint/canton-dev-tools <command>`
- Helpers: `@fairmint/canton-dev-tools/testing`
- Pins: Dev Tools
  [COMPATIBILITY.md](https://github.com/Fairmint/canton-dev-tools/blob/main/COMPATIBILITY.md)

Domain integration tests under `test/integration/localnet/**` remain in this repo; only their
imports come from Dev Tools.
