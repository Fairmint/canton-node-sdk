# LocalNet Testing Guide

This repository’s integration tests talk to a live CN-Quickstart stack. The GitHub Actions job
`.github/workflows/test-cn-quickstart.yml` is the source of truth: it provisions the Quickstart
submodule, installs the DAML SDK, starts Docker Compose, builds the SDK, and finally runs Jest.

Use this document whenever you want to mimic CI locally (or inside another AI session).

## Prerequisites

- Node.js 20+
- npm 10+
- Java 21 (Temurin works; matches CI’s `setup-java` step)
- Docker Engine ≥ 27 and Docker Compose ≥ 2.27 (Quickstart’s `make start` checks for these)
- ~15 GB of free disk space for images + caches
- Ports `8082`, `3903`, `3975`, `3000`, etc. must be free for the Quickstart containers

## One-Time Setup

```bash
npm install
npm run artifacts:clone-splice        # pulls libs/splice and libs/cn-quickstart
pushd libs/cn-quickstart/quickstart
echo 2 | make setup                   # option 2 enables OAuth2 like CI does
make install-daml-sdk                 # installs to ~/.daml
export PATH="$HOME/.daml/bin:$PATH"   # add daml CLI for this shell/session
popd
```

The `make setup` invocation produces `.env.local` with OAuth2, observability, and other required
flags. If you need to tweak anything later, re-run `make setup`.

## Starting CN-Quickstart

```bash
cd libs/cn-quickstart/quickstart
make start                            # builds frontend/backend, then runs docker compose up
```

The `start` target builds the frontend, backend, DAML packages, then performs the same Compose
startup that CI performs. When it succeeds, the following endpoints respond:

- Keycloak: `curl -f http://localhost:8082/realms/AppProvider`
- Validator API: `curl -f http://localhost:3903/api/validator/v0/wallet/user-status`

If `make start` fails with `Docker CLI not found`, install Docker before retrying. All integration
tests will otherwise fail with `Authentication failed` because OAuth cannot reach Keycloak.

## Running the SDK Tests

```bash
npm run build   # generates OpenAPI types, client stubs, compiles TypeScript
npm test        # runs unit + integration suites (localnet tests hit Quickstart)
```

> **Tip:** The CI workflow runs `npm run fix` (lint) before it clones the submodules, so ESLint never
> traverses `libs/splice` or `libs/cn-quickstart`. If you already cloned them for testing, either run
> `npx eslint . --ignore-pattern 'libs/splice/**' --ignore-pattern 'libs/cn-quickstart/**'` or lint
> before running `npm run artifacts:clone-splice`.

Jest will now be able to call `ledgerJsonApi.getVersion()` and `ledgerJsonApi.getLedgerEnd()` against
the running Quickstart participant. You can also target individual suites, e.g.
`npm test test/integration/localnet/get-ledger-end.test.ts`.

## Service Teardown

```bash
cd libs/cn-quickstart/quickstart
make stop
```

## Troubleshooting

- **`Authentication failed` in tests:** Quickstart isn’t running, or Keycloak/Validator ports are not
  reachable. Re-run `make start` and wait for the readiness curls to succeed.
- **`Docker CLI not found` / `docker info` fails:** Install Docker (or run on a host that already has
  it). Without Docker the Quickstart stack cannot start.
- **Need a clean slate:** Run `make clean-all` inside `libs/cn-quickstart/quickstart` to stop and
  remove all containers/volumes.

Following the steps above reproduces every relevant stage of
`.github/workflows/test-cn-quickstart.yml`, so future AI runs can quickly identify what is required to
execute the integration suites locally.

