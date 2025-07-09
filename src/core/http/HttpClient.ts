import axios, { AxiosInstance } from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import { RequestConfig } from '../types';
import { ApiError, NetworkError } from '../errors';

export class HttpClient {
  private axiosInstance: AxiosInstance;
  private logDir: string;
  private enableFileLogging: boolean;
  private displayedLogMessage = false;

  constructor(enableLogging = true, logDir?: string) {
    this.axiosInstance = axios.create();
    this.enableFileLogging = enableLogging;
    this.logDir = logDir || path.join(__dirname, '../../logs');

    this.setupLogging();
  }

  private setupLogging(): void {
    if (!this.enableFileLogging) {
      return;
    }

    if (!this.displayedLogMessage) {
      console.log(`🔍 Logging enabled: ${this.enableFileLogging} to ${this.logDir}`);
      this.displayedLogMessage = true;
    }

    if (!fs.existsSync(this.logDir)) {
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
      } catch (error) {
        console.warn('Could not create logs directory, disabling file logging:', error);
        this.enableFileLogging = false;
      }
    }
  }

  public async makeGetRequest<T>(
    url: string,
    config: RequestConfig = {}
  ): Promise<T> {
    try {
      const headers = await this.buildHeaders(config);
      const response = await this.axiosInstance.get<T>(url, { headers });

      await this.logRequestResponse(url, { method: 'GET', headers }, response.data);
      return response.data;
    } catch (error) {
      throw this.handleRequestError(error, 'GET', url);
    }
  }

  public async makePostRequest<T>(
    url: string,
    data: unknown,
    config: RequestConfig = {}
  ): Promise<T> {
    try {
      const headers = await this.buildHeaders(config);
      const response = await this.axiosInstance.post<T>(url, data, { headers });

      await this.logRequestResponse(url, { method: 'POST', headers, data }, response.data);
      return response.data;
    } catch (error) {
      throw this.handleRequestError(error, 'POST', url);
    }
  }

  private async buildHeaders(config: RequestConfig): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};

    if (config.contentType) {
      headers['Content-Type'] = config.contentType;
    } else {
      headers['Content-Type'] = 'application/json';
    }

    if (config.includeBearerToken) {
      // This will be set by the client that uses this HTTP client
      // The bearer token should be passed in the config or set separately
    }

    return headers;
  }

  public setBearerToken(token: string): void {
    this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  public clearBearerToken(): void {
    delete this.axiosInstance.defaults.headers.common['Authorization'];
  }

  private async logRequestResponse(
    url: string,
    request: unknown,
    response: unknown
  ): Promise<void> {
    if (!this.enableFileLogging) {
      return;
    }

    try {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        url,
        request: this.sanitizeForLogging(request),
        response: this.sanitizeForLogging(response),
      };

      const logFile = path.join(this.logDir, `api-${timestamp.split('T')[0]}.log`);
      const logLine = JSON.stringify(logEntry) + '\n';

      await fs.promises.appendFile(logFile, logLine);
    } catch (error) {
      console.warn('Failed to log request/response:', error);
    }
  }

  private sanitizeForLogging(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return obj;
    }

    if (typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Skip sensitive fields
        if (['password', 'client_secret', 'access_token', 'authorization'].includes(key.toLowerCase())) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }

    return obj;
  }

  private handleRequestError(error: unknown, method: string, url: string): Error {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const statusText = error.response?.statusText;
      const errorData = error.response?.data
        ? JSON.stringify(error.response.data, null, 2)
        : error.message;

      return new ApiError(
        `${method} request to ${url} failed with status ${status} ${statusText}: ${errorData}`,
        status,
        statusText,
        error
      );
    }

    return new NetworkError(
      `${method} request to ${url} failed: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
} 