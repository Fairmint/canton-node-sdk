/** ValidatorApiClient integration tests: ANS Operations. */

import type { ScanProxyAnsEntry } from '../../../../src/clients/validator-api/operations/v0/scan-proxy';
import { ensureValidatorUserOnboarded, getClient, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS } from './setup';

function expectScanProxyAnsEntry(entry: ScanProxyAnsEntry): void {
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

async function getDsoAnsEntry(client: ReturnType<typeof getClient>): Promise<ScanProxyAnsEntry> {
  const dso = await client.getDsoPartyId();
  const response = await client.lookupAnsEntryByParty({ party: dso.dso_party_id });

  expectScanProxyAnsEntry(response.entry);
  expect(response.entry.user).toBe(dso.dso_party_id);
  expect(response.entry.contract_id).toBeNull();
  expect(response.entry.expires_at).toBeNull();

  return response.entry;
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
    const dsoEntry = await getDsoAnsEntry(client);
    const response = await client.listAnsEntries({ name_prefix: dsoEntry.name, page_size: 20 });

    expect(Array.isArray(response.entries)).toBe(true);
    expect(response.entries.length).toBeGreaterThan(0);
    expect(response.entries.length).toBeLessThanOrEqual(20);
    response.entries.forEach(expectScanProxyAnsEntry);

    const listedDsoEntry = response.entries.find((entry) => entry.name === dsoEntry.name);
    expect(listedDsoEntry).toEqual(dsoEntry);
    expect(listedDsoEntry?.contract_id).toBeNull();
    expect(listedDsoEntry?.expires_at).toBeNull();
  });

  test('lookupAnsEntryByName and lookupAnsEntryByParty preserve nullable DSO fields', async () => {
    const client = getClient();
    const dsoEntry = await getDsoAnsEntry(client);
    const byName = await client.lookupAnsEntryByName({ name: dsoEntry.name });

    expect(byName.entry).toEqual(dsoEntry);
    expectScanProxyAnsEntry(byName.entry);
    expect(byName.entry.contract_id).toBeNull();
    expect(byName.entry.expires_at).toBeNull();
  });
});
