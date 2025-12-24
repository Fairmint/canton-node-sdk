import { ScanApiOperation } from '../../ScanApiOperation';



type Params = Record<string, never> | undefined;

/** Check if the scan API is ready. Returns void on success. */
export class IsReady extends ScanApiOperation<Params, void> {
  async execute(_params?: Params): Promise<void> {
    await this.makeGetRequest<void>('/api/scan/readyz');
  }
}
