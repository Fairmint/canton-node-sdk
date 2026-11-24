/** Field rules shared by the text ownership message (`./ownership`) and the wallet proof message (`./wallet-proof`). */

/** Printable ASCII without spaces. */
const TOKEN_PATTERN = /^[!-~]+$/;

/** Whether `value` may be a message's party: a Canton party id (`hint::namespace`) of printable ASCII. */
export function isWalletOwnershipPartyId(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length <= 512 && TOKEN_PATTERN.test(value) && value.split('::').length === 2
  );
}
