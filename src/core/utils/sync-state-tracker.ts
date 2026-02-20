import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface SyncState {
  /** The last offset we successfully processed */
  readonly lastSuccessfulOffset: number;
  /** The ledger end at the time of our last successful sync */
  readonly ledgerEndAtSync: number;
  /** ISO timestamp of last update */
  readonly lastUpdated: string;
  /** Additional metadata for debugging */
  readonly metadata?: {
    readonly hostname?: string;
    readonly processId?: number;
  };
}

export interface SyncStateTrackerOptions {
  /** Network name (mainnet, devnet) */
  readonly network: string;
  /** Provider name (intellect, 5n) */
  readonly provider: string;
  /** Optional: Custom directory for state files (defaults to ~/.canton-sync-state) */
  readonly stateDirectory?: string;
}

function getDefaultStateDirectory(): string {
  const envDir = process.env['CANTON_SYNC_STATE_DIR'];
  if (envDir) {
    return envDir;
  }

  const homeDir = os.homedir();
  return path.join(homeDir, '.canton-sync-state');
}

/**
 * Local file-based tracking of ledger sync progress.
 */
export class SyncStateTracker {
  private readonly stateFilePath: string;
  private readonly directoryWritable: boolean;
  private cachedState: SyncState | null = null;

  constructor(options: SyncStateTrackerOptions) {
    const stateDir = options.stateDirectory ?? getDefaultStateDirectory();

    let isWritable = true;
    if (!fs.existsSync(stateDir)) {
      try {
        fs.mkdirSync(stateDir, { recursive: true });
      } catch {
        isWritable = false;
      }
    }

    this.directoryWritable = isWritable;
    this.stateFilePath = path.join(stateDir, `${options.network}-${options.provider}.json`);
  }

  isWritable(): boolean {
    return this.directoryWritable;
  }

  getState(): SyncState | null {
    if (this.cachedState) {
      return this.cachedState;
    }

    if (!this.directoryWritable) {
      return null;
    }

    try {
      if (!fs.existsSync(this.stateFilePath)) {
        return null;
      }

      const content = fs.readFileSync(this.stateFilePath, 'utf-8');
      const state = JSON.parse(content) as SyncState;

      if (
        typeof state.lastSuccessfulOffset !== 'number' ||
        typeof state.ledgerEndAtSync !== 'number' ||
        typeof state.lastUpdated !== 'string'
      ) {
        return null;
      }

      this.cachedState = state;
      return state;
    } catch {
      return null;
    }
  }

  updateState(offset: number, ledgerEnd: number): void {
    if (!this.directoryWritable) {
      return;
    }

    const state: SyncState = {
      lastSuccessfulOffset: offset,
      ledgerEndAtSync: ledgerEnd,
      lastUpdated: new Date().toISOString(),
      metadata: {
        hostname: process.env['HOSTNAME'] ?? 'unknown',
        processId: process.pid,
      },
    };

    this.cachedState = state;

    try {
      const tempPath = `${this.stateFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
      fs.renameSync(tempPath, this.stateFilePath);
    } catch {
      // Ignore local persistence errors and continue with in-memory progress.
    }
  }

  getStartingOffset(currentLedgerEnd: number): { offset: number; wasReset: boolean } | null {
    const state = this.getState();

    if (!state) {
      return null;
    }

    if (state.lastSuccessfulOffset > currentLedgerEnd) {
      this.resetState();
      return { offset: 0, wasReset: true };
    }

    const safeOffset = Math.max(0, state.lastSuccessfulOffset - 1);
    return { offset: safeOffset, wasReset: false };
  }

  resetState(): void {
    this.cachedState = null;
    try {
      if (fs.existsSync(this.stateFilePath)) {
        fs.unlinkSync(this.stateFilePath);
      }
    } catch {
      // Best-effort deletion; in-memory cache is already cleared.
    }
  }

  getStateFilePath(): string {
    return this.stateFilePath;
  }
}
