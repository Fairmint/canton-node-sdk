# LocalNet testing

Read the public [LocalNet guide](https://github.com/Fairmint/canton-node-sdk/wiki/LocalNet-testing)
first.

**ENG-1635:** `@fairmint/canton-dev-tools` owns shared LocalNet pins going forward. This
repository's `bin/canton-localnet` soft-delegates to that package when installed; otherwise it falls
back to the deprecated `scripts/localnet-cloud.sh`. Prefer Dev Tools commands for pin-sensitive
work. Current `package.json` `localnet:*` scripts, integration tests, and the fallback scripts
remain the source of truth for commands that still run through this repo until the hard cutover.
