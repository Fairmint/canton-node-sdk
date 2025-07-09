import * as path from 'path';
import * as fs from 'fs';
import { Logger, LoggerConfig } from './Logger';

/** Logs API requests and responses to files with sensitive data redaction */
export class FileLogger implements Logger {
  private logDir: string;
  private enableFileLogging: boolean;
  private displayedLogMessage = false;

  constructor(config: LoggerConfig = {}) {
    this.enableFileLogging = config.enableLogging ?? true;
    this.logDir = config.logDir || path.join(__dirname, '../../../logs');

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

  public async logRequestResponse(
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
} 