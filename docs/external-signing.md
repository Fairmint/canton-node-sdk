# External-party signing

External parties keep the Ed25519 private key outside the Canton participant. The participant
prepares topology or transaction data, the key holder approves and signs the exact returned hash,
and the participant verifies the signature during submission.

## Boundary

1. Generate or load an Ed25519 key in the client, wallet, HSM, or other trusted signer.
2. Resolve the target synchronizer and generate the external-party topology.
3. Sign the returned topology hash and allocate the party.
4. For later writes, prepare the transaction with the intended commands and acting party.
5. Display or otherwise verify the action being approved, sign the exact prepared hash, and submit
   the prepared transaction with that signature.

The backend must never receive private keys or a reusable signing delegation. Bind prepared work to
the expected party, commands, receiver, amount, expiry, nonce, and authenticated application
session; reject substitutions before submission.

## SDK entrypoints

The convenience flow starts with `createExternalParty` and then uses `prepareExternalTransaction` /
`executeExternalTransaction`. Lower-level topology and key helpers are exported for integrations
that need custom custody or approval UX. Read their current input and result types under
[`src/utils/external-signing/`](../src/utils/external-signing/).

[`examples/external-signing.ts`](../examples/external-signing.ts) is the maintained LocalNet
walkthrough. It generates an in-memory key only for demonstration; production keys need an
appropriate custody and recovery design.

## Retry and failure behavior

Do not assume that a timeout means a command was not sequenced. Use stable command and submission
identifiers where supported, then query completions or updates before retrying. Never reuse a
signature for different prepared bytes.
