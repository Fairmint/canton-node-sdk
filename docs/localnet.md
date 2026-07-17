# LocalNet development

The repository pins Canton quickstart environments through git submodules and wraps their lifecycle
with `bin/canton-localnet`. The exact commands are the scripts in [`package.json`](../package.json).

## Setup and lifecycle

```bash
git submodule update --init --depth 1 libs/splice
git submodule update --init --recursive libs/cn-quickstart
npm install
npm run localnet:setup
npm run localnet:start
npm run localnet:status
npm run localnet:smoke
npm run test:integration
npm run localnet:stop
```

`npm run localnet:verify` is the one-shot repository verification path. Use `localnet:logs` when a
service is not ready. The scripts under [`bin/canton-localnet`](../bin/canton-localnet) and
[`scripts/localnet/`](../scripts/localnet/) define the current containers, ports, authentication
mode, readiness checks, and teardown behavior.

LocalNet mutates Docker state and local volumes. Use the repository wrapper instead of manually
reusing containers from a different package line, and stop the environment when verification
finishes. Hosted-network credentials are not required for the default local environment.

## Verifying a consumer

Start with [`examples/canton-quickstart.ts`](../examples/canton-quickstart.ts) or
[`examples/localnet-with-oauth2.ts`](../examples/localnet-with-oauth2.ts). For a consumer
repository, pin a compatible SDK and quickstart version, wait for readiness, deploy the required
DARs, and run its integration suite before treating a smoke-only response as proof of business
behavior.
