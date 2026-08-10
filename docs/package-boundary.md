# Package boundary (production vs CI-only)

This document describes what `@fairmint/canton-node-sdk` publishes to npm versus what stays
repository / CI-only. Repeatable enforcement lives in `npm run check:package-artifacts`
(`.github/workflows/package-artifacts.yml`).

## Production (published)

| Surface | Path / field | Notes |
| --- | --- | --- |
| Runtime SDK | `build/src/**` | Ledger / Validator / Scan clients and helpers from `src/` |
| Package metadata | `package.json`, `LICENSE`, `README.md` | Always included by npm |

LocalNet CLI and shared integration-test helpers are **not** published here. They live in
[`@fairmint/canton-dev-tools`](https://www.npmjs.com/package/@fairmint/canton-dev-tools)
(`0.1.1+`), including `scripts/localnet-cloud.sh` and `@fairmint/canton-dev-tools/testing`.

## CI-only / must not publish

| Surface | Why |
| --- | --- |
| `libs/**` (cn-quickstart, splice submodules) | Docker / LocalNet fixtures; huge; not runtime |
| `*.dar` | DAML archives are not Node runtime artifacts |
| `fixtures/**` | Test fixtures (none shipped today; guarded) |
| `test/**`, `build/test/**` | Unit / LocalNet integration tests |
| `scripts/**` | Codegen, release, lint tooling (LocalNet engine removed) |
| `bin/**` | No published CLI; use `@fairmint/canton-dev-tools` |
| `examples/**`, `build/examples/**` | Demo sources (see wiki / repo tree) |
| `build/scripts/**` | Compiled lint/codegen helpers |
| `node_modules/**`, crash dumps (`core*`) | Accidental local artifacts |

`prepack` runs `clean` + `build:core` so a normal publish only emits `build/src/**`. The `files`
field is narrowed to `build/src/**` so a dirty workspace that still contains `build/test` cannot
leak compiled tests into the tarball.

## Related packages

- Canonical LocalNet owner: [`@fairmint/canton-dev-tools`](https://github.com/Fairmint/canton-dev-tools)
  ([COMPATIBILITY.md](https://github.com/Fairmint/canton-dev-tools/blob/main/COMPATIBILITY.md))
- Tracking: [ENG-1635](https://linear.app/fairmint/issue/ENG-1635/establish-canton-dev-tools-and-migrate-shared-canton-test)
