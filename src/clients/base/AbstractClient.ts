import axios, { AxiosInstance } from 'axios';
import { ProviderConfig } from './config';
import { NetworkType, ProviderType } from './types';
import { AuthResponse, ProviderConfigENVFormat } from './types';
import path from 'path';
import * as fs from 'fs';
import { env } from '../../env';
import { URLSearchParams } from 'url';

type GetHeadersConfig = {
  contentType?: string;
  includeBearerToken?: boolean;
};

// Custom error class to preserve API error responses
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly originalError: any,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let displayedLogMessage = false;

export class AbstractClient {
  private config: ProviderConfig;
  private apiType: 'JSON_API' | 'VALIDATOR_API';
  public bearerToken: string | null = null;
  public provider: ProviderConfigENVFormat;
  private axiosInstance: AxiosInstance;
  private logDir: string;
  private enableFileLogging: boolean;
  public network: NetworkType;
  public providerType: ProviderType;

  constructor(
    config: ProviderConfig,
    apiType: 'JSON_API' | 'VALIDATOR_API',
    network?: NetworkType,
    providerType?: ProviderType
  ) {
    this.config = config;
    this.apiType = apiType;
    this.network = network || config.getCurrentNetwork();
    this.providerType = providerType || config.getCurrentProvider();

    const provider = config.getApiSpecificConfig(
      this.apiType,
      this.network,
      this.providerType
    );
    if (!provider) {
      const networkStr = this.network;
      const providerStr = this.providerType;
      throw new Error(
        `Provider configuration not found for network '${networkStr}' and provider '${providerStr}'. Please check your environment variables.`
      );
    }
    this.provider = provider;

    this.axiosInstance = axios.create();
    console.log(`🔍 Connected to ${this.provider.PROVIDER_NAME}`);

    const isServerless = env.NODE_ENV === 'production';
    this.enableFileLogging = !isServerless;

    this.logDir = path.join(__dirname, '../../logs');
    if (!displayedLogMessage) {
      console.log(
        `🔍 Logging enabled ${this.enableFileLogging ? 'true' : 'false'} to ${this.logDir}`
      );
      displayedLogMessage = true;
    }

    if (this.enableFileLogging && !fs.existsSync(this.logDir)) {
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
      } catch (error) {
        console.warn(
          'Could not create logs directory, disabling file logging:',
          error
        );
        this.enableFileLogging = false;
      }
    }
  }

  public async authenticate(): Promise<string> {
    const apiConfig = this.provider[this.apiType];

    // Check if authentication credentials are provided
    if (!apiConfig.CLIENT_ID || apiConfig.CLIENT_ID.trim() === '') {
      // Check if this is due to missing environment variables
      const expectedEnvVars = this.getExpectedEnvironmentVariables();
      const missingVars = expectedEnvVars.filter(
        varName => !process.env[varName]
      );

      if (missingVars.length > 0) {
        throw new Error(
          `Authentication credentials not found for ${this.apiType}. ` +
            `Missing environment variables: ${missingVars.join(', ')}. ` +
            `Provider: ${this.provider.PROVIDER_NAME}, Network: ${this.network}. ` +
            `Please check your .env file and ensure all required authentication variables are set.`
        );
      }

      // No authentication credentials provided, skip authentication
      // This allows the system to work with just the URI
      this.bearerToken = null;
      return '';
    }

    if (!apiConfig.GRANT_TYPE) {
      throw new Error(
        `Missing required configuration for ${this.apiType}: GRANT_TYPE is required when CLIENT_ID is provided`
      );
    }

    // Validate required auth configuration
    const missingConfig = [];
    if (!apiConfig.CLIENT_ID) missingConfig.push('CLIENT_ID');
    if (!apiConfig.GRANT_TYPE) missingConfig.push('GRANT_TYPE');

    // Check for grant type specific requirements
    if (apiConfig.GRANT_TYPE === 'password' && !apiConfig.USERNAME) {
      missingConfig.push('USERNAME');
    }
    if (apiConfig.GRANT_TYPE === 'password' && !apiConfig.PASSWORD) {
      missingConfig.push('PASSWORD');
    }
    if (
      apiConfig.GRANT_TYPE === 'client_credentials' &&
      !apiConfig.CLIENT_SECRET
    ) {
      missingConfig.push('CLIENT_SECRET');
    }

    if (missingConfig.length > 0) {
      const expectedEnvVars = this.getExpectedEnvironmentVariables();
      throw new Error(
        `Authentication configuration incomplete for ${this.apiType}. Missing required fields: ${missingConfig.join(', ')}. ` +
          `Provider: ${this.provider.PROVIDER_NAME}, Network: ${this.network}, Grant Type: ${apiConfig.GRANT_TYPE}. ` +
          `Expected environment variables: ${expectedEnvVars.join(', ')}`
      );
    }

    const formData = new URLSearchParams();
    formData.append('grant_type', apiConfig.GRANT_TYPE);
    formData.append('client_id', apiConfig.CLIENT_ID);
    const clientSecret = this.provider[this.apiType]?.CLIENT_SECRET;
    if (clientSecret) {
      formData.append('client_secret', clientSecret);
    }
    const audience = this.provider[this.apiType]?.AUDIENCE;
    if (audience) {
      formData.append('audience', audience);
    }
    const scope = this.provider[this.apiType]?.SCOPE;
    if (scope) {
      formData.append('scope', scope);
    }
    const username = this.provider[this.apiType]?.USERNAME;
    if (username) {
      formData.append('username', username);
    }
    const password = this.provider[this.apiType]?.PASSWORD;
    if (password) {
      formData.append('password', password);
    }

    try {
      const response = await this.makePostRequest<AuthResponse>(
        this.provider.AUTH_URL,
        formData.toString(),
        {
          contentType: 'application/x-www-form-urlencoded',
          includeBearerToken: false,
        }
      );

      if (!response.access_token) {
        throw new Error(
          `Authentication response missing access_token. Response: ${JSON.stringify(response, null, 2)}`
        );
      }

      this.bearerToken = response.access_token;
      return this.bearerToken!;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        const errorData = error.response?.data
          ? JSON.stringify(error.response.data, null, 2)
          : error.message;

        throw new Error(
          `Authentication failed for ${this.provider.PROVIDER_NAME} (${this.network}): ` +
            `HTTP ${status} ${statusText} - ${errorData}`
        );
      }
      throw new Error(
        `Authentication failed for ${this.provider.PROVIDER_NAME} (${this.network}): ${error}`
      );
    }
  }

  public async getBearerToken(): Promise<string> {
    if (!this.bearerToken) {
      await this.authenticate();
    }

    if (!this.bearerToken) {
      throw new Error(
        `No bearer token available after authentication for ${this.provider.PROVIDER_NAME} (${this.network}). ` +
          `This may indicate missing or invalid authentication credentials.`
      );
    }

    return this.bearerToken;
  }

  protected async getHeaders(
    config: GetHeadersConfig
  ): Promise<Record<string, string>> {
    if (!this.bearerToken && config.includeBearerToken) {
      await this.authenticate();
    }

    if (config.includeBearerToken && !this.bearerToken) {
      throw new Error(
        `Bearer token is required but not available after authentication attempt for ${this.provider.PROVIDER_NAME} (${this.network}). ` +
          `Please check your authentication configuration and credentials.`
      );
    }

    const headers = {
      ...(config.includeBearerToken &&
        this.bearerToken && {
          Authorization: `Bearer ${this.bearerToken}`,
        }),
      ...(config.contentType && { 'Content-Type': config.contentType }),
    };
    return headers;
  }

  protected async logRequestResponse(
    url: string,
    request: unknown,
    response: unknown
  ): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (!this.enableFileLogging) {
      console.log(`[${timestamp}] ${url}`, { request, response });
      return;
    }

    const logFile = path.join(this.logDir, `request-${timestamp}.json`);

    const logData = {
      timestamp,
      url,
      request,
      response,
    };

    try {
      const safeStringify = (obj: unknown): string => {
        return JSON.stringify(
          obj,
          (_key, value) => {
            if (value === undefined) {
              return '[undefined]';
            }
            if (typeof value === 'function') {
              return '[function]';
            }
            if (value instanceof Error) {
              return {
                name: value.name,
                message: value.message,
                stack: value.stack,
              };
            }
            return value;
          },
          2
        );
      };

      fs.writeFileSync(logFile, safeStringify(logData));
    } catch (error) {
      const fallbackLogData = {
        timestamp,
        url,
        request: request ? '[request data]' : null,
        response: response ? '[response data]' : null,
        serializationError:
          error instanceof Error ? error.message : String(error),
      };

      try {
        fs.writeFileSync(logFile, JSON.stringify(fallbackLogData, null, 2));
      } catch (writeError) {
        console.error('Failed to write log file:', writeError);
      }
    }
  }

  public getConfig(): ProviderConfig {
    return this.config;
  }

  private getExpectedEnvironmentVariables(): string[] {
    const network = this.network.toUpperCase();
    const provider = this.providerType.toUpperCase();
    const apiType =
      this.apiType === 'JSON_API' ? 'LEDGER_JSON_API' : this.apiType;

    const expectedVars = [
      `CANTON_${network}_${provider}_${apiType}_CLIENT_ID`,
      `CANTON_${network}_${provider}_${apiType}_CLIENT_SECRET`,
    ];

    // Add grant type specific variables
    if (this.provider[this.apiType]?.GRANT_TYPE === 'password') {
      expectedVars.push(`CANTON_${network}_${provider}_${apiType}_USERNAME`);
      expectedVars.push(`CANTON_${network}_${provider}_${apiType}_PASSWORD`);
    }

    return expectedVars;
  }

  public async makePostRequest<T>(
    url: string,
    data: unknown,
    getHeadersConfig: GetHeadersConfig
  ): Promise<T> {
    const headers = await this.getHeaders(getHeadersConfig);

    try {
      const response = await this.axiosInstance.post(url, data, { headers });

      // Log the request and response
      await this.logRequestResponse(url, { data, headers }, response.data);

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Log the request and error
        await this.logRequestResponse(
          url,
          { data, headers },
          error.response?.data || error
        );
        
        // If we have error response data, throw it directly
        if (error.response?.data) {
          throw error.response.data;
        }
        
        // Otherwise throw a generic error
        throw new Error(`POST request failed: ${error.message}`);
      }
      // Log the request and error
      await this.logRequestResponse(url, { data, headers }, error);
      throw error;
    }
  }

  public async makeGetRequest<T>(
    url: string,
    getHeadersConfig: GetHeadersConfig
  ): Promise<T> {
    const headers = await this.getHeaders(getHeadersConfig);

    try {
      const response = await this.axiosInstance.get(url, { headers });

      // Log the request and response
      await this.logRequestResponse(url, { headers }, response.data);

      return response.data;
    } catch (error) {
      // Log the request and error
      await this.logRequestResponse(url, { headers }, error);

      if (axios.isAxiosError(error)) {
        // If we have error response data, throw it directly
        if (error.response?.data) {
          throw error.response.data;
        }
        
        // Otherwise throw a generic error
        throw new Error(`GET request failed: ${error.message}`);
      }
      throw error;
    }
  }
}
