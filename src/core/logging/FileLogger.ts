import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { LogLevels, type LogLevel, type Logger, type LoggerConfig } from './Logger';
dotenv.config();

/** Logs API requests and responses to files with sensitive data redaction */
export class FileLogger implements Logger {
  private readonly logDir: string;
  private enableFileLogging: boolean;
  private readonly logLevel: LogLevel;

  constructor(config: LoggerConfig = {}) {
    const disableEnv = process.env['DISABLE_FILE_LOGGER'];
    const isDisabledByEnv =
      typeof disableEnv === 'string' && ['1', 'true', 'yes', 'on'].includes(disableEnv.toLowerCase());
    this.enableFileLogging = isDisabledByEnv ? false : (config.enableLogging ?? true);
    this.logDir = config.logDir ?? process.env['FILE_LOGGER_DIR'] ?? path.join(__dirname, '../../../logs');
    this.logLevel = config.logLevel ?? 'info';

    this.setupLogging();
  }

  private setupLogging(): void {
    if (!this.enableFileLogging) {
      return;
    }

    if (!fs.existsSync(this.logDir)) {
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
      } catch {
        this.enableFileLogging = false;
      }
    }
  }

  public async logRequestResponse(url: string, request: unknown, response: unknown): Promise<void> {
    if (!this.enableFileLogging) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      url,
      request: this.sanitizeForLogging(request),
      response: this.sanitizeForLogging(response),
    };

    const logFile = path.join(this.logDir, `api-${timestamp.split('T')[0]}.log`);
    const logLine = `${JSON.stringify(logEntry)}\n`;

    await fs.promises.appendFile(logFile, logLine);
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    this.writeLog('debug', message, context);
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.writeLog('info', message, context);
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.writeLog('warn', message, context);
  }

  public error(message: string, context?: Record<string, unknown>): void {
    this.writeLog('error', message, context);
  }

  private writeLog(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.enableFileLogging || !this.shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(context ? { context: this.sanitizeForLogging(context) } : {}),
    };

    const logFile = path.join(this.logDir, `api-${timestamp.split('T')[0]}.log`);
    const logLine = `${JSON.stringify(logEntry)}\n`;

    fs.appendFileSync(logFile, logLine);
  }

  private shouldLog(level: LogLevel): boolean {
    return LogLevels[level] <= LogLevels[this.logLevel];
  }

  private sanitizeForLogging(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeForLogging(item));
    }

    if (typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Skip sensitive fields
        if (
          ['password', 'client_secret', 'access_token', 'authorization', 'refresh_token', 'id_token'].includes(
            key.toLowerCase()
          )
        ) {
          sanitized[key] = '[REDACTED]';
        } else {
          // Recursively sanitize nested objects
          sanitized[key] = this.sanitizeForLogging(value);
        }
      }
      return sanitized;
    }

    return obj;
  }
}
