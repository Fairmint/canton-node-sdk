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

  constructor(
    private readonly authUrl: string,
    private readonly authConfig: AuthConfig,
    private readonly logger?: Logger
  ) {}

  public async authenticate(): Promise<string> {
    // Check if we have a valid token
    if (this.isTokenValid()) {
      return this.bearerToken!;
    }
    // Check if authentication credentials are provided
    if (!this.authConfig.clientId || this.authConfig.clientId.trim() === '') {
      // No authentication credentials provided, skip authentication
      this.bearerToken = null;
      return '';
    }

    // Validate required auth configuration
    this.validateAuthConfig();

    const formData = new URLSearchParams();
    formData.append('grant_type', this.authConfig.grantType);
    formData.append('client_id', this.authConfig.clientId);

    if (this.authConfig.clientSecret) {
      formData.append('client_secret', this.authConfig.clientSecret);
    }
    if (this.authConfig.audience) {
      formData.append('audience', this.authConfig.audience);
    }
    if (this.authConfig.scope) {
      formData.append('scope', this.authConfig.scope);
    }
    if (this.authConfig.username) {
      formData.append('username', this.authConfig.username);
    }
    if (this.authConfig.password) {
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

      // Set token expiry if provided
      if (response.data.expires_in) {
        this.tokenExpiry = Date.now() + response.data.expires_in * 1000;
      }

      // Log success
      if (this.logger) {
        await this.logger.logRequestResponse(url, { method: 'POST', headers, data: requestBody }, response.data);
      }

      return this.bearerToken;
    } catch (error) {
      // Log failure with context
      if (this.logger) {
        const errorPayload = axios.isAxiosError(error)
          ? error.response?.data || error.message
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
  }

  private validateAuthConfig(): void {
    const missingConfig: string[] = [];

    if (!this.authConfig.clientId) missingConfig.push('clientId');
    if (!this.authConfig.grantType) missingConfig.push('grantType');

    // Check for grant type specific requirements
    if (this.authConfig.grantType === 'password') {
      if (!this.authConfig.username) missingConfig.push('username');
      if (!this.authConfig.password) missingConfig.push('password');
    }
    // Note: client_credentials grant type may not always require client_secret
    // Some providers allow client_credentials without secret for public clients

    if (missingConfig.length > 0) {
      throw new AuthenticationError(
        `Authentication configuration incomplete. Missing required fields: ${missingConfig.join(', ')}. ` +
          `Grant Type: ${this.authConfig.grantType}`
      );
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
