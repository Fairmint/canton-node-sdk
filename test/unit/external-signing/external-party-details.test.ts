import { readMatchingExternalPartyDetails } from '../../../src/utils/external-signing/external-party-details';

describe('external-party details parsing', (): void => {
  it('selects an exact party from scalar or array-shaped Canton responses', (): void => {
    const expected = { party: 'expected::party', isLocal: true };

    expect(readMatchingExternalPartyDetails({ partyDetails: expected }, expected.party)).toBe(expected);
    expect(
      readMatchingExternalPartyDetails(
        {
          partyDetails: [{ party: 'other::party' }, { party: '' }, expected],
        },
        expected.party
      )
    ).toBe(expected);
  });

  it('ignores malformed, empty, and non-matching party details', (): void => {
    expect(readMatchingExternalPartyDetails({ partyDetails: [{ party: '' }, { party: 123 }] })).toBeNull();
    expect(
      readMatchingExternalPartyDetails({ partyDetails: [{ party: 'other::party' }] }, 'expected::party')
    ).toBeNull();
  });
});
