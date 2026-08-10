# Package boundary (production vs CI-only)

This document describes what `@fairmint/canton-node-sdk` publishes to npm versus what stays
repository / CI-only. Repeatable enforcement lives in `npm run check:package-artifacts`
(`.github/workflows/package-artifacts.yml`).

## Production (published)

| Surface | Path / field | Notes |
| --- | --- | --- |
| Runtime SDK | `build/src/**` | Ledger / Validator / Scan clients and helpers from `src/` |
| Package metadata | `package.json`, `LICENSE`, `README.md` | Always included by npm |

### Soft-migration LocalNet CLI (temporary)

| Surface | Path / field | Notes |
| --- | --- | --- |
| LocalNet CLI | `bin/canton-localnet` (`package.json#bin`) | Soft-delegates to `@fairmint/canton-dev-tools` when installed |
| Cloud LocalNet helper | `scripts/localnet-cloud.sh` | Used by the fallback CLI path |

**TODO (ENG-1635 hard cutover):** remove `bin/canton-localnet` and `scripts/localnet-cloud.sh`
from `package.json` `files` / `bin` once consumers depend on `@fairmint/canton-dev-tools` for
LocalNet. Until then, package artifact checks *require* these paths (known published surface) and
document the exception.

Prefer:

```bash
npx @fairmint/canton-dev-tools start
npm install -D @fairmint/canton-dev-tools
```

## CI-only / must not publish

| Surface | Why |
| --- | --- |
| `libs/**` (cn-quickstart, splice submodules) | Docker / LocalNet fixtures; huge; not runtime |
| `*.dar` | DAML archives are not Node runtime artifacts |
| `fixtures/**` | Test fixtures (none shipped today; guarded) |
| `test/**`, `build/test/**` | Unit / LocalNet integration tests |
| `scripts/**` except `localnet-cloud.sh` | Codegen, release, and lint tooling |
| `examples/**`, `build/examples/**` | Demo sources (see wiki / repo tree) |
| `build/scripts/**` | Compiled lint/codegen helpers |
| `node_modules/**`, crash dumps (`core*`) | Accidental local artifacts |

`prepack` runs `clean` + `build:core` so a normal publish only emits `build/src/**`. The `files`
field is narrowed to `build/src/**` so a dirty workspace that still contains `build/test` cannot
leak compiled tests into the tarball.

## Related packages

- Canonical LocalNet owner: [`@fairmint/canton-dev-tools`](https://github.com/Fairmint/canton-dev-tools)
- Soft migration / hard cutover tracking: [ENG-1635](https://linear.app/fairmint/issue/ENG-1635/establish-canton-dev-tools-and-migrate-shared-canton-test)
