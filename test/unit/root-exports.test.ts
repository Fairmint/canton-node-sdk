/**
 * Symbols consumers once reached only through deep `build/...` paths, now exported from the package root. Each must be
 * the same object as the module that defines it (not a same-named private copy, such as the module-private
 * `CommandSchema` and `DisclosedContractSchema` in `schemas/api/interactive-submission.ts`).
 */
import * as Root from '../../src';
import { SubscribeToRawUpdates } from '../../src/clients/ledger-json-api/operations/v2/updates/subscribe-to-raw-updates';
import { CommandSchema, DisclosedContractSchema } from '../../src/clients/ledger-json-api/schemas/api/commands';
import { type InteractiveSubmissionHashingSchemeVersion as SchemaHashingSchemeVersion } from '../../src/clients/ledger-json-api/schemas/api/interactive-submission';

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

/** True only when A and B are the same type (not merely mutually assignable through a widened alias). */
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

describe('root type exports', () => {
  it('export the hashing scheme type the public CC transfer types use', () => {
    // A consumer that infers a prepared CC transfer must be able to name its `hashingSchemeVersion` through the root
    // entry; otherwise its declaration emit fails with TS2883 (seen in apiv2 on 0.0.299).
    const sameAsRequest: Equals<Root.InteractiveSubmissionHashingSchemeVersion, SchemaHashingSchemeVersion> = true;
    const sameAsPrepared: Equals<
      NonNullable<Root.PreparedExternalPartyWalletCcTransfer['hashingSchemeVersion']>,
      Root.InteractiveSubmissionHashingSchemeVersion
    > = true;
    expect([sameAsRequest, sameAsPrepared]).toEqual([true, true]);
  });
});
