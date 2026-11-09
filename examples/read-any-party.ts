#!/usr/bin/env tsx
/**
 * Example: Archive every party's updates exactly as the participant sends them
 *
 * Demonstrates an any-party reader: no party list anywhere. It checks that the user holds `CanReadAsAnyParty`, reads a
 * bounded range page by page with `getRawUpdatesPage`, then tails the ledger with `subscribeToRawUpdates`, resuming
 * from `lastOffset` after every token refresh. It stores each update exactly as the participant sent it: a page item's
 * own slice of the response text, or a stream frame's text (offset checkpoints arrive only on the stream). Both also
 * come with their unnormalized `JSON.parse` value.
 *
 * Prerequisites:
 *
 * - LocalNet running, with credentials configured for the Ledger JSON API
 * - A ledger user with the `CanReadAsAnyParty` right
 *
 * Usage: npx tsx examples/read-any-party.ts [begin-offset]
 */

import { Canton, assertCanReadAsAnyParty, buildUpdateFormat, type RawUpdateFrame } from '../src';

function store(kind: string, offset: number | undefined, text: string): void {
  console.log(kind, offset, `${String(text.length)} bytes`);
}

async function main(): Promise<void> {
  const canton = new Canton({ network: 'localnet' });
  const { ledger } = canton;

  // Fails at once, naming the user and the rights it holds, if CanReadAsAnyParty is missing.
  const { userId } = await assertCanReadAsAnyParty(ledger);
  console.log(`Reading every party as ${userId}`);

  // One format for every read: every party's transactions (with created event blobs), reassignments and topology events.
  const updateFormat = buildUpdateFormat({
    anyParty: true,
    includeCreatedEventBlob: true,
    includeTopologyEvents: true,
  });

  // Catch up to the current ledger end in pages.
  let cursor = Number(process.argv[2] ?? '0');
  const { offset: ledgerEnd } = await ledger.getLedgerEnd({});
  let pageToken: string | undefined;
  do {
    const page = await ledger.getRawUpdatesPage({
      updateFormat,
      beginOffsetExclusive: cursor,
      endOffsetInclusive: ledgerEnd,
      maxPageSize: 100,
      ...(pageToken !== undefined && { pageToken }),
    });
    for (const update of page.updates) store(update.kind, update.offset, update.text);
    pageToken = page.nextPageToken;
    if (pageToken === undefined) cursor = page.highestPageOffsetInclusive;
  } while (pageToken !== undefined);

  // Then tail. Only a tailing stream carries offset checkpoints.
  console.log(`Tailing after offset ${String(cursor)} (Ctrl+C to stop)`);
  for (;;) {
    const stream = ledger.subscribeToRawUpdates({
      updateFormat,
      beginExclusive: cursor,
      idleTimeoutMs: 5 * 60_000,
      onFrame: (frame: RawUpdateFrame) => {
        store(frame.kind, frame.offset, frame.text);
      },
    });
    try {
      const end = await stream.done;
      console.log(`Stream ended (${end.reason}); resuming after ${String(end.lastOffset)}`);
    } finally {
      cursor = stream.lastOffset;
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
