import { LedgerJsonApiClient } from '../../../src';
import type { ClientConfig, NetworkType, ProviderType } from '../../../src/core/types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export interface LocalnetClientOptions {
  clientConfig?: ClientConfig;
  network?: NetworkType;
  provider?: ProviderType;
}

export interface LocalnetTestContext {
  ledgerClient: LedgerJsonApiClient;
  network: NetworkType;
  provider: ProviderType;
  apiBaseUrl: string;
}

export interface LocalnetEndpointSpec<TResponse> {
  name: string;
  method: HttpMethod;
  path: string;
  call: () => Promise<TResponse>;
  expectResponse: (response: TResponse) => void;
  requestExample?: unknown;
  captureResponse?: (response: TResponse) => unknown;
  timeoutMs?: number;
}

export function createLocalnetLedgerClient(options?: LocalnetClientOptions): LedgerJsonApiClient {
  if (options?.clientConfig) {
    return new LedgerJsonApiClient(options.clientConfig);
  }

  const config: ClientConfig = {
    network: options?.network ?? 'localnet',
  };

  if (options?.provider) {
    config.provider = options.provider;
  }

  return new LedgerJsonApiClient(config);
}

export function createLocalnetTestContext(options?: LocalnetClientOptions): LocalnetTestContext {
  const ledgerClient = createLocalnetLedgerClient(options);
  const network = ledgerClient.getNetwork();
  const provider = (ledgerClient.getProvider() ?? options?.provider ?? 'app-provider') as ProviderType;

  return {
    ledgerClient,
    network,
    provider,
    apiBaseUrl: ledgerClient.getApiUrl(),
  };
}

export function defineEndpointTest<TResponse>(
  spec: LocalnetEndpointSpec<TResponse>,
  log: (message: string) => void = console.info
): void {
  const testName = `[${spec.method}] ${spec.path} — ${spec.name}`;
  const runner = async (): Promise<void> => {
    if (spec.requestExample !== undefined) {
      log(`${testName} request: ${JSON.stringify(spec.requestExample, null, 2)}`);
    }

    const response = await spec.call();
    spec.expectResponse(response);

    if (spec.captureResponse) {
      const summary = spec.captureResponse(response);
      if (summary !== undefined) {
        log(`${testName} response sample: ${JSON.stringify(summary, null, 2)}`);
      }
    }
  };

  if (spec.timeoutMs !== undefined) {
    it(testName, runner, spec.timeoutMs);
  } else {
    it(testName, runner);
  }
}
