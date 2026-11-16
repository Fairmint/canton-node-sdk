/**
 * Call every listener, even when one throws: a listener's error must not skip the others or leave the caller's
 * bookkeeping half done (a latch held, a state half published). Each error is rethrown on a fresh task, where the host
 * reports it as uncaught, so it is not swallowed.
 */
export function notifyListeners(listeners: Iterable<() => void>): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      setTimeout(() => {
        throw error;
      }, 0);
    }
  }
}
