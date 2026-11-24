/** The compact wallet proof message (`wallet-proof-v1`): one spelling per set of fields, strict parsing. */
import {
  buildWalletProofMessage,
  parseWalletProofMessage,
  WALLET_PROOF_MAX_MESSAGE_LENGTH,
  type WalletProofFields,
} from '../../../src/wallets/wallet-proof';

const FIELDS: WalletProofFields = {
  domain: 'fairmint:tokenization-wallet-proof:v1',
  network: 'devnet',
  partyId: 'holder::1220aa',
  investorContext: 'investor-42',
  idempotencyKey: 'idem-7',
  issuedAt: '2026-11-24T10:00:00.000Z',
  expiresAt: '2026-11-24T10:05:00.000Z',
};

const MESSAGE =
  '{"domain":"fairmint:tokenization-wallet-proof:v1","network":"devnet","partyId":"holder::1220aa",' +
  '"investorContext":"investor-42","idempotencyKey":"idem-7","issuedAt":"2026-11-24T10:00:00.000Z",' +
  '"expiresAt":"2026-11-24T10:05:00.000Z"}';

describe('buildWalletProofMessage', () => {
  it("is one line of JSON with apiv2's key order, whatever order the fields come in", () => {
    expect(buildWalletProofMessage(FIELDS)).toBe(MESSAGE);
    const reversed = Object.fromEntries(Object.entries(FIELDS).reverse()) as unknown as WalletProofFields;
    expect(buildWalletProofMessage(reversed)).toBe(MESSAGE);
    // What apiv2's investor app signs: JSON.stringify of the same object.
    expect(MESSAGE).toBe(JSON.stringify(FIELDS));
  });

  it('leaves out keys that are not message fields', () => {
    expect(buildWalletProofMessage({ ...FIELDS, extra: 'x' } as WalletProofFields)).toBe(MESSAGE);
  });

  it.each([
    ['an empty domain', { domain: '' }, 'domain'],
    ['a domain with a space', { domain: 'a b' }, 'domain'],
    ['another network', { network: 'testnet' }, 'network'],
    ['a party id without a namespace', { partyId: 'holder' }, 'partyId'],
    ['an empty investorContext', { investorContext: '' }, 'investorContext'],
    ['an empty idempotencyKey', { idempotencyKey: '' }, 'idempotencyKey'],
    ['a time without an offset', { issuedAt: '2026-11-24T10:00:00.000' }, 'issuedAt'],
    ['a day that does not exist', { issuedAt: '2026-02-30T10:00:00Z' }, 'issuedAt'],
    ['a month that does not exist', { expiresAt: '2026-13-01T10:00:00Z' }, 'expiresAt'],
    ['expiresAt not after issuedAt', { expiresAt: FIELDS.issuedAt }, 'expiresAt must be after issuedAt'],
  ])('throws TypeError for %s', (_name, change, problem) => {
    expect(() => buildWalletProofMessage({ ...FIELDS, ...change } as WalletProofFields)).toThrow(TypeError);
    expect(() => buildWalletProofMessage({ ...FIELDS, ...change } as WalletProofFields)).toThrow(problem);
  });

  it('throws for a message longer than the limit', () => {
    const long = { ...FIELDS, investorContext: 'x'.repeat(WALLET_PROOF_MAX_MESSAGE_LENGTH) };
    expect(() => buildWalletProofMessage(long)).toThrow('longer than 4096 characters');
  });

  it('escapes as JSON.stringify does, so the message stays one line', () => {
    const message = buildWalletProofMessage({ ...FIELDS, investorContext: 'line\nbreak "quoted" é' });
    expect(message).not.toContain('\n');
    expect(parseWalletProofMessage(message)?.investorContext).toBe('line\nbreak "quoted" é');
  });
});

describe('parseWalletProofMessage', () => {
  it('parses a message back to its fields', () => {
    expect(parseWalletProofMessage(MESSAGE)).toEqual(FIELDS);
  });

  it.each([
    ['ISO with an offset', '2026-11-24T11:00:00+01:00', '2026-11-24T11:05:00+01:00'],
    ['no fraction', '2026-11-24T10:00:00Z', '2026-11-24T10:05:00Z'],
    ['no seconds', '2026-11-24T10:00Z', '2026-11-24T10:05Z'],
    ['microseconds', '2026-11-24T10:00:00.000001Z', '2026-11-24T10:05:00.000001Z'],
  ])('accepts timestamps as apiv2 does: %s', (_name, issuedAt, expiresAt) => {
    const message = JSON.stringify({ ...FIELDS, issuedAt, expiresAt });
    expect(parseWalletProofMessage(message)).toEqual({ ...FIELDS, issuedAt, expiresAt });
  });

  const refused: Array<[string, string]> = [
    ['not JSON', 'Canton wallet ownership proof'],
    ['an array', JSON.stringify([FIELDS])],
    ['whitespace', JSON.stringify(FIELDS, null, 1)],
    ['a trailing newline', `${MESSAGE}\n`],
    ['a missing key', JSON.stringify({ ...FIELDS, idempotencyKey: undefined })],
    ['an extra key', JSON.stringify({ ...FIELDS, extra: 'x' })],
    ['another key order', JSON.stringify(Object.fromEntries(Object.entries(FIELDS).reverse()))],
    ['a number value', JSON.stringify({ ...FIELDS, investorContext: 42 })],
    ['a null value', JSON.stringify({ ...FIELDS, idempotencyKey: null })],
    ['another domain alphabet', JSON.stringify({ ...FIELDS, domain: 'has space' })],
    ['another network', JSON.stringify({ ...FIELDS, network: 'canton:devnet' })],
    ['a bad timestamp', JSON.stringify({ ...FIELDS, issuedAt: 'yesterday' })],
    ['expiresAt before issuedAt', JSON.stringify({ ...FIELDS, expiresAt: '2026-11-24T09:00:00.000Z' })],
    ['a needless escape', MESSAGE.replace('holder', '\\u0068older')],
    ['a duplicate key', MESSAGE.replace('{"domain":', '{"domain":"x","domain":')],
    ['too long', JSON.stringify({ ...FIELDS, investorContext: 'x'.repeat(WALLET_PROOF_MAX_MESSAGE_LENGTH) })],
  ];
  it.each(refused)('refuses %s', (_name, text) => {
    expect(parseWalletProofMessage(text)).toBeNull();
  });

  it('refuses a value that is not a string', () => {
    expect(parseWalletProofMessage(7 as unknown as string)).toBeNull();
  });
});
