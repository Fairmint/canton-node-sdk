/**
 * Browser storage, read defensively: the accessor itself may throw (a sandboxed frame, blocked site data), and a
 * missing or refusing storage behaves as empty.
 */

/** The part of the DOM `Storage` the wallets module uses (`localStorage` and `sessionStorage` satisfy it). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isStorageLike(value: unknown): value is StorageLike {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Record<keyof StorageLike, unknown>>;
  return (
    typeof candidate.getItem === 'function' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.removeItem === 'function'
  );
}

/** The page's `localStorage` or `sessionStorage`, or null where there is none or reading it throws. */
export function globalStorage(kind: 'local' | 'session'): StorageLike | null {
  try {
    // Optional globals: absent outside a browser, and the getter throws where site data is blocked.
    const storage: unknown = kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    return isStorageLike(storage) ? storage : null;
  } catch {
    return null;
  }
}

/** `storage.getItem(key)`, or null when there is no storage or it throws. */
export function readStorage(storage: StorageLike | null, key: string): string | null {
  if (storage === null) return null;
  try {
    const value = storage.getItem(key);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** Sets (`value` a string) or removes (`null`) `key`; a missing or refusing storage is ignored. */
export function writeStorage(storage: StorageLike | null, key: string, value: string | null): void {
  if (storage === null) return;
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Storage refused (a private window, a full quota): the next visit starts without it.
  }
}
