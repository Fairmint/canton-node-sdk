# canton-node-sdk

See [CLAUDE.md](CLAUDE.md), [README.md](README.md), and
`.cursor/skills/localnet-testing/SKILL.md`.

## LocalNet ownership (ENG-1635)

**`@fairmint/canton-dev-tools` owns LocalNet pins going forward** (cn-quickstart ref, Splice,
Scribe, protocol version). See that package's `COMPATIBILITY.md`.

This repository still ships `bin/canton-localnet` and `scripts/localnet-cloud.sh` as a **soft
migration** fallback:

- `bin/canton-localnet` soft-delegates to `@fairmint/canton-dev-tools` when that package is
  installed (optionalDependency / optional peer).
- Set `CANTON_LOCALNET_FORCE_LEGACY=1` to force the deprecated SDK scripts.
- `package.json` `localnet:*` scripts still call `bin/canton-localnet` (which prefers Dev Tools).
- Prefer `npx @fairmint/canton-dev-tools <command>` or `npm run localnet:dev-tools -- <command>`
  when the optional dependency is present.
- Do **not** treat SDK-local pins in `bin/canton-localnet` as the long-term source of truth.

## Cursor Cloud specific instructions

Repo checks (`npm install`, `npm run fix`, `npm test`, `npm run build`) need no dashboard secrets.
`npm install` does not require `NPM_TOKEN` here (dependencies are public). The optional
`@fairmint/canton-dev-tools` git dependency needs GitHub network access (public repo).

### Canton LocalNet on a cloud VM

LocalNet runs Canton Network Quickstart in Docker. `npm run localnet:start` (=
`bin/canton-localnet start`, which prefers `@fairmint/canton-dev-tools`, infra-only + OAuth2 by
default) is self-provisioning on the cloud image: it `apt`-installs Docker, starts a `dockerd`
(vfs storage driver, iptables-legacy) via passwordless `sudo`, adds
`scan.localhost`/`sv.localhost`/`wallet.localhost` to `/etc/hosts`, runs cn-quickstart `make setup`,
brings up the compose stack, and waits for the Validator, Scan, and Ledger JSON APIs.

Prerequisites (on demand — heavy, not in the dashboard update script):

```bash
git submodule update --init --recursive --depth 1 libs/cn-quickstart
git submodule update --init --depth 1 libs/splice
npm install
npm run localnet:start   # first run ~10-15 min: image pulls + Splice DSO bootstrap
npm run localnet:smoke   # Keycloak/Validator/Scan/Ledger reachability
npm run localnet:stop
```

Verified ready endpoints: Ledger JSON API `http://localhost:3975/v2/version` (returned `3.5.4`),
Scan `http://scan.localhost:4000/api/scan/v0/dso-party-id` (returns the DSO party id), Validator
`http://localhost:3903/...` (200/401).

Known gotchas hit in this cloud/multi-repo setup:

- **Port 3000 conflict.** LocalNet's `nginx` binds host `127.0.0.1:3000`, which collides with the
  `apiv2` dev gateway (also `:3000`). Free `:3000` (stop the apiv2 dev server) before starting
  LocalNet, or `nginx` fails with `failed to bind host port 127.0.0.1:3000: address already in use`.
- **`nginx` left network-less after a failed start.** If `nginx`'s first start fails (e.g. the port
  clash above), the container is created but never attached to the `quickstart` Docker network, then
  crash-loops with `host not found in upstream "splice"`. Fix: `sudo docker rm -f nginx` and re-run
  `npm run localnet:start` so it is recreated and attached.
- **Splice force-recreate can stall Scan readiness.** The SDK patches the Splice config
  (`enable-forced-acs-snapshots`) and force-recreates the running Splice, which disrupts `nginx`'s
  static upstream resolution and can make the Scan API miss its readiness window. Once the config is
  applied, set `CANTON_NODE_SDK_SPLICE_CONFIG_PENDING=false` in
  `libs/cn-quickstart/quickstart/.env.local` to skip the recreate on the next start.

Do not commit the `libs/cn-quickstart` / `libs/splice` submodule pointer changes produced by
`submodule update`.
