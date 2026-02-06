import axios from 'axios';
import { URLSearchParams } from 'url';
import { ApiError, AuthenticationError } from '../errors';
import { type Logger } from '../logging';
import { type AuthConfig } from '../types';

export interface AuthResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

/** Manages OAuth2 authentication and token lifecycle */
export class AuthenticationManager {
  private bearerToken: string | null = null;
  private tokenExpiry: number | null = null;
  private tokenIssuedAt: number | null = null;

  constructor(
    private readonly authUrl: string,
    private readonly authConfig: AuthConfig,
    private readonly logger?: Logger
  ) {}

  public async authenticate(): Promise<string> {
    // Check if we have a valid token
    if (this.isTokenValid() && this.bearerToken) {
      return this.bearerToken;
    }

    // Check for static bearer token first
    if (this.authConfig.bearerToken) {
      this.bearerToken = this.authConfig.bearerToken;
      return this.bearerToken;
    }

    // Check for token generator function
    if (this.authConfig.tokenGenerator) {
      this.bearerToken = await this.authConfig.tokenGenerator();
      // Tokens from generator may have short expiry, so don't cache for long
      this.tokenIssuedAt = Date.now();
      this.tokenExpiry = this.tokenIssuedAt + 60 * 1000; // 1 minute cache
      return this.bearerToken;
    }

    // Check if OAuth2 authentication credentials are provided
    if (!this.authConfig.clientId || this.authConfig.clientId.trim() === '') {
      // No authentication credentials provided, skip authentication
      this.bearerToken = null;
      return '';
    }

    // Validate required auth configuration for OAuth2
    this.validateAuthConfig();

    const formData = new URLSearchParams();
    formData.append('grant_type', this.authConfig.grantType);
    formData.append('client_id', this.authConfig.clientId);

    if (this.authConfig.grantType === 'client_credentials' && this.authConfig.clientSecret) {
      formData.append('client_secret', this.authConfig.clientSecret);
    }
    if (this.authConfig.audience) {
      formData.append('audience', this.authConfig.audience);
    }
    if (this.authConfig.scope) {
      formData.append('scope', this.authConfig.scope);
    }
    if (this.authConfig.grantType === 'password') {
      formData.append('username', this.authConfig.username);
      formData.append('password', this.authConfig.password);
    }

    const url = `${this.authUrl}/`;
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

    // Build a log-friendly representation of the request body
    const requestBody: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      requestBody[key] = value;
    }

    try {
      const response = await axios.post<AuthResponse>(url, formData.toString(), {
        headers,
      });

      if (!response.data.access_token) {
        throw new AuthenticationError(
          `Authentication response missing access_token. Response: ${JSON.stringify(response.data, null, 2)}`
        );
      }

      this.bearerToken = response.data.access_token;
      this.tokenIssuedAt = Date.now();

      // Set token expiry if provided
      if (response.data.expires_in) {
        this.tokenExpiry = this.tokenIssuedAt + response.data.expires_in * 1000;
      }

      // Log success
      if (this.logger) {
        await this.logger.logRequestResponse(url, { method: 'POST', headers, data: requestBody }, response.data);
      }

      return this.bearerToken;
    } catch (error) {
      // Log failure with context
      if (this.logger) {
        const errorPayload: unknown = axios.isAxiosError(error)
          ? (error.response?.data ?? error.message)
          : error instanceof Error
            ? error.message
            : String(error);
        await this.logger.logRequestResponse(url, { method: 'POST', headers, data: requestBody }, errorPayload);
      }

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        const errorData = error.response?.data ? JSON.stringify(error.response.data, null, 2) : error.message;

        throw new ApiError(
          `Authentication failed for URL ${url} with status ${status} ${statusText}: ${errorData}`,
          status,
          statusText
        );
      }

      throw new AuthenticationError(
        `Authentication failed for URL ${url}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  public async getBearerToken(): Promise<string> {
    return this.authenticate();
  }

  public clearToken(): void {
    this.bearerToken = null;
    this.tokenExpiry = null;
    this.tokenIssuedAt = null;
  }

  /**
   * Returns the token expiry timestamp in milliseconds since epoch, or null if not available. Use this to schedule
   * proactive token refresh before expiration.
   */
  public getTokenExpiryTime(): number | null {
    return this.tokenExpiry;
  }

  /** Returns the timestamp when the current token was issued, in milliseconds since epoch, or null if not available. */
  public getTokenIssuedAt(): number | null {
    return this.tokenIssuedAt;
  }

  /**
   * Returns the token lifetime in milliseconds, or null if not available. Calculated as the difference between token
   * expiry time and issue time.
   */
  public getTokenLifetimeMs(): number | null {
    if (this.tokenIssuedAt === null || this.tokenExpiry === null) {
      return null;
    }
    return this.tokenExpiry - this.tokenIssuedAt;
  }

  private validateAuthConfig(): void {
    // Runtime validation for grantType (TypeScript only provides compile-time checks)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for external config sources
    if (!this.authConfig.grantType) {
      throw new AuthenticationError(
        `Authentication configuration incomplete. Missing required field: grantType.`
      );
    }
    if (!this.authConfig.clientId) {
      throw new AuthenticationError(
        `Authentication configuration incomplete. Missing required field: clientId. ` +
          `Grant Type: ${this.authConfig.grantType}`
      );
    }
    // Runtime validation for password grant type (TypeScript only provides compile-time checks)
    if (this.authConfig.grantType === 'password') {
      const missingFields: string[] = [];
      if (!this.authConfig.username) {
        missingFields.push('username');
      }
      if (!this.authConfig.password) {
        missingFields.push('password');
      }
      if (missingFields.length > 0) {
        throw new AuthenticationError(
          `Authentication configuration incomplete for password grant type. Missing required field(s): ${missingFields.join(', ')}.`
        );
      }
    }
  }

  private isTokenValid(): boolean {
    if (!this.bearerToken) {
      return false;
    }

    // If no expiry is set, assume token is valid
    if (!this.tokenExpiry) {
      return true;
    }

    // Check if token has expired (with 5 minute buffer)
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    return Date.now() < this.tokenExpiry - bufferTime;
  }
}
