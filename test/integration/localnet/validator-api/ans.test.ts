/** ValidatorApiClient integration tests: ANS Operations. */

import { ensureValidatorUserOnboarded, getClient, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS } from './setup';

function expectScanProxyAnsEntry(entry: {
  contract_id?: string | null;
  user: string;
  name: string;
  url: string;
  description: string;
  expires_at?: string | null;
}): void {
  expect(entry.user).toEqual(expect.any(String));
  expect(entry.name).toEqual(expect.any(String));
  expect(entry.url).toEqual(expect.any(String));
  expect(entry.description).toEqual(expect.any(String));
  if (entry.contract_id != null) {
    expect(entry.contract_id).toEqual(expect.any(String));
  }
  if (entry.expires_at != null) {
    expect(Number.isNaN(Date.parse(entry.expires_at))).toBe(false);
  }
}

describe('ValidatorApiClient / ANS', () => {
  beforeAll(ensureValidatorUserOnboarded, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS);

  test('listOwnedAnsEntries returns ANS entries owned by the validator user', async () => {
    const client = getClient();
    const response = await client.listOwnedAnsEntries();

    expect(response).toBeDefined();
    expect(Array.isArray(response.entries)).toBe(true);
  });

  test('listAnsEntries returns scan-wide entries in the generated wire format', async () => {
    const client = getClient();
    const response = await client.listAnsEntries({ page_size: 20 });

    expect(Array.isArray(response.entries)).toBe(true);
    expect(response.entries.length).toBeGreaterThan(0);
    expect(response.entries.length).toBeLessThanOrEqual(20);
    response.entries.forEach(expectScanProxyAnsEntry);

    const dsoEntry = response.entries.find((entry) => entry.contract_id === null && entry.expires_at === null);
    expect(dsoEntry).toBeDefined();
  });

  test('lookupAnsEntryByName and lookupAnsEntryByParty preserve nullable DSO fields', async () => {
    const client = getClient();
    const listed = await client.listAnsEntries({ page_size: 20 });
    const dsoEntry = listed.entries.find((entry) => entry.contract_id === null && entry.expires_at === null);

    expect(dsoEntry).toBeDefined();
    if (dsoEntry === undefined) {
      throw new Error('LocalNet did not expose its expected DSO-provided ANS entry');
    }

    const [byName, byParty] = await Promise.all([
      client.lookupAnsEntryByName({ name: dsoEntry.name }),
      client.lookupAnsEntryByParty({ party: dsoEntry.user }),
    ]);

    expect(byName.entry).toEqual(dsoEntry);
    expectScanProxyAnsEntry(byParty.entry);
    expect(byParty.entry.contract_id).toBeNull();
    expect(byParty.entry.expires_at).toBeNull();
  });
});
