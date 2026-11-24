/**
 * Symbols consumers once reached only through deep `build/...` paths, now exported from the package root. Each must be
 * the same object as the module that defines it (not a same-named private copy, such as the module-private
 * `CommandSchema` and `DisclosedContractSchema` in `schemas/api/interactive-submission.ts`).
 */
import * as Root from '../../src';
import { SubscribeToRawUpdates } from '../../src/clients/ledger-json-api/operations/v2/updates/subscribe-to-raw-updates';
import { CommandSchema, DisclosedContractSchema } from '../../src/clients/ledger-json-api/schemas/api/commands';

describe('root exports', () => {
  it('export the Ledger JSON API command schemas from the root', () => {
    expect(Root.CommandSchema).toBe(CommandSchema);
    expect(Root.DisclosedContractSchema).toBe(DisclosedContractSchema);
  });

  it('export the SubscribeToRawUpdates operation from the root', () => {
    expect(Root.SubscribeToRawUpdates).toBe(SubscribeToRawUpdates);
    expect(typeof Root.SubscribeToRawUpdates.prototype.connect).toBe('function');
  });
});
