interface DeferredTokenRequest {
  readonly kind: 'deferred';
  readonly promise: Promise<string>;
  readonly resolve: (token: string) => void;
  readonly reject: (error: Error) => void;
}

interface ImmediateTokenRequest {
  readonly kind: 'immediate';
  readonly token: string;
}

type QueuedTokenRequest = DeferredTokenRequest | ImmediateTokenRequest;

class MockRestClientAuthenticationManager {
  public static readonly DEFAULT_TOKEN_LIFETIME_MS = 60 * 60 * 1000;
  public static instances: MockRestClientAuthenticationManager[] = [];
  public static queuedRequests: QueuedTokenRequest[] = [];

  public authenticateCallCount = 0;
  public clearTokenCallCount = 0;

  private bearerToken: string | null = null;
  private tokenExpiry: number | null = null;
  private tokenIssuedAt: number | null = null;

  constructor(_authConfig: object, _logger?: object) {
    MockRestClientAuthenticationManager.instances.push(this);
  }

  public async authenticate(): Promise<string> {
    this.authenticateCallCount += 1;

    if (this.isTokenValid() && this.bearerToken !== null) {
      return this.bearerToken;
    }

    const request = MockRestClientAuthenticationManager.queuedRequests.shift();
    if (!request) {
      throw new Error('No queued auth response available for test');
    }

    const token = request.kind === 'immediate' ? request.token : await request.promise;
    this.tokenIssuedAt = Date.now();
    this.tokenExpiry = this.tokenIssuedAt + MockRestClientAuthenticationManager.DEFAULT_TOKEN_LIFETIME_MS;
    this.bearerToken = token;
    return token;
  }

  public clearToken(): void {
    this.clearTokenCallCount += 1;
    this.bearerToken = null;
    this.tokenExpiry = null;
    this.tokenIssuedAt = null;
  }

  public getTokenExpiryTime(): number | null {
    return this.tokenExpiry;
  }

  public getTokenIssuedAt(): number | null {
    return this.tokenIssuedAt;
  }

  public getTokenLifetimeMs(): number | null {
    if (this.tokenIssuedAt === null || this.tokenExpiry === null) {
      return null;
    }
    return this.tokenExpiry - this.tokenIssuedAt;
  }

  public static reset(): void {
    MockRestClientAuthenticationManager.instances = [];
    MockRestClientAuthenticationManager.queuedRequests = [];
  }

  private isTokenValid(): boolean {
    if (this.bearerToken === null) {
      return false;
    }
    if (this.tokenExpiry === null) {
      return true;
    }

    const lifetimeMs = this.getTokenLifetimeMs();
    const defaultBufferMs = 5 * 60 * 1000;
    const bufferMs = lifetimeMs !== null ? Math.min(defaultBufferMs, Math.floor(lifetimeMs / 2)) : defaultBufferMs;
    return Date.now() < this.tokenExpiry - bufferMs;
  }
}

jest.mock('@hardlydifficult/rest-client', () => {
  const actual = jest.requireActual<typeof import('@hardlydifficult/rest-client')>('@hardlydifficult/rest-client');
  return {
    ...actual,
    AuthenticationManager: MockRestClientAuthenticationManager,
  };
});

import { CantonRuntime, LedgerJsonApiClient, type ClientConfig, ValidatorApiClient } from '../../../src';

function createDeferredTokenRequest(): DeferredTokenRequest {
  let resolveToken!: (token: string) => void;
  let rejectToken!: (error: Error) => void;

  const promise = new Promise<string>((resolve, reject) => {
    resolveToken = resolve;
    rejectToken = reject;
  });

  return {
    kind: 'deferred',
    promise,
    resolve: resolveToken,
    reject: rejectToken,
  };
}

function createClientConfig(validatorClientId = 'shared-client'): ClientConfig {
  return {
    network: 'localnet',
    authUrl: 'https://auth.example',
    apis: {
      LEDGER_JSON_API: {
        apiUrl: 'https://ledger.example',
        auth: {
          grantType: 'client_credentials',
          clientId: 'shared-client',
          clientSecret: 'secret',
        },
      },
      VALIDATOR_API: {
        apiUrl: 'https://validator.example',
        auth: {
          grantType: 'client_credentials',
          clientId: validatorClientId,
          clientSecret: 'secret',
        },
      },
    },
  };
}

describe('CantonRuntime shared auth sessions', () => {
  beforeEach(() => {
    MockRestClientAuthenticationManager.reset();
  });

  it('reuses the same auth session across clients with the same auth identity', async () => {
    MockRestClientAuthenticationManager.queuedRequests.push({ kind: 'immediate', token: 'shared-token' });

    const runtime = new CantonRuntime(createClientConfig());
    const ledgerClient = new LedgerJsonApiClient(runtime);
    const validatorClient = new ValidatorApiClient(runtime);

    await expect(ledgerClient.authenticate()).resolves.toBe('shared-token');
    await expect(validatorClient.authenticate()).resolves.toBe('shared-token');

    expect(MockRestClientAuthenticationManager.instances).toHaveLength(1);
    expect(MockRestClientAuthenticationManager.instances[0]?.authenticateCallCount).toBe(2);
  });

  it('coalesces concurrent token fetches into a single in-flight request', async () => {
    const deferredRequest = createDeferredTokenRequest();
    MockRestClientAuthenticationManager.queuedRequests.push(deferredRequest);

    const runtime = new CantonRuntime(createClientConfig());
    const ledgerClient = new LedgerJsonApiClient(runtime);
    const validatorClient = new ValidatorApiClient(runtime);

    const ledgerAuthPromise = ledgerClient.authenticate();
    const validatorAuthPromise = validatorClient.authenticate();

    expect(MockRestClientAuthenticationManager.instances).toHaveLength(1);
    expect(MockRestClientAuthenticationManager.instances[0]?.authenticateCallCount).toBe(1);

    deferredRequest.resolve('single-flight-token');

    await expect(ledgerAuthPromise).resolves.toBe('single-flight-token');
    await expect(validatorAuthPromise).resolves.toBe('single-flight-token');
  });

  it('keeps auth sessions separate for distinct auth principals', async () => {
    MockRestClientAuthenticationManager.queuedRequests.push({ kind: 'immediate', token: 'ledger-token' });
    MockRestClientAuthenticationManager.queuedRequests.push({ kind: 'immediate', token: 'validator-token' });

    const runtime = new CantonRuntime(createClientConfig('validator-client'));
    const ledgerClient = new LedgerJsonApiClient(runtime);
    const validatorClient = new ValidatorApiClient(runtime);

    await expect(ledgerClient.authenticate()).resolves.toBe('ledger-token');
    await expect(validatorClient.authenticate()).resolves.toBe('validator-token');

    expect(MockRestClientAuthenticationManager.instances).toHaveLength(2);
  });

  it('invalidates a shared session for sibling clients when one client clears the token', async () => {
    MockRestClientAuthenticationManager.queuedRequests.push({ kind: 'immediate', token: 'initial-token' });
    MockRestClientAuthenticationManager.queuedRequests.push({ kind: 'immediate', token: 'refreshed-token' });

    const runtime = new CantonRuntime(createClientConfig());
    const ledgerClient = new LedgerJsonApiClient(runtime);
    const validatorClient = new ValidatorApiClient(runtime);

    await expect(ledgerClient.authenticate()).resolves.toBe('initial-token');
    ledgerClient.clearToken();
    await expect(validatorClient.authenticate()).resolves.toBe('refreshed-token');

    expect(MockRestClientAuthenticationManager.instances).toHaveLength(1);
    expect(MockRestClientAuthenticationManager.instances[0]?.clearTokenCallCount).toBe(1);
    expect(MockRestClientAuthenticationManager.instances[0]?.authenticateCallCount).toBe(2);
  });
});
