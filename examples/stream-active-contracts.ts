#!/usr/bin/env tsx
/**
 * Example: Read a party's holdings by interface, then follow the ledger
 *
 * Demonstrates `streamActiveContracts`, which reads the active contract set (ACS) one item at a time instead of
 * collecting the whole snapshot in memory, with an interface filter that returns each contract's interface view. It
 * then continues from the snapshot's offset with `subscribeToUpdates`, so no update between the two reads is missed.
 *
 * Prerequisites:
 *
 * - LocalNet running, with credentials configured for the Ledger JSON API
 * - A party that holds token-standard holdings
 *
 * Usage: npx tsx examples/stream-active-contracts.ts <party-id>
 */

import { Canton, TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID } from '../src';

async function main(): Promise<void> {
  const party = process.argv[2];
  if (party === undefined) {
    throw new Error('Usage: npx tsx examples/stream-active-contracts.ts <party-id>');
  }

  const canton = new Canton({ network: 'localnet' });

  // The stream applies the filter on the participant and yields each item as it arrives. A slow consumer slows the
  // participant's sends instead of growing a buffer.
  const stream = canton.ledger.streamActiveContracts({
    parties: [party],
    interfaceIds: [TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID],
    includeInterfaceView: true,
  });

  let count = 0;
  for await (const item of stream) {
    if ('JsActiveContract' in item.contractEntry) {
      const { createdEvent } = item.contractEntry.JsActiveContract;
      console.log(createdEvent.contractId, createdEvent.interfaceViews);
      count++;
    }
  }
  console.log(`Read ${String(count)} holdings`);

  // An iteration that ends without an error has read the whole snapshot. One that fails (for example when the
  // connection drops) throws, so a partial snapshot is never mistaken for a complete one.
  //
  // The offset is known once iteration has started. Continue from it rather than from the current ledger end.
  const { activeAtOffset } = stream;
  if (activeAtOffset === undefined) {
    throw new Error('The snapshot offset is known once iteration has started');
  }

  console.log(`Following updates after offset ${String(activeAtOffset)} (Ctrl+C to stop)`);
  await canton.ledger.subscribeToUpdates({
    parties: [party],
    beginExclusive: activeAtOffset,
    interfaceIds: [TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID],
    includeInterfaceView: true,
    onMessage: (message) => {
      console.log(JSON.stringify(message));
    },
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
