import { ScanApiOperation } from '../../ScanApiOperation';



type Params = Record<string, never> | undefined;

/** Check if the scan API is live. Returns void on success. */
export class IsLive extends ScanApiOperation<Params, void> {
  async execute(_params?: Params): Promise<void> {
    await this.makeGetRequest<void>('/api/scan/livez');
  }
}
