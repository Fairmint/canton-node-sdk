/* eslint-disable no-console */
import { LOG_LEVEL_VALUES, type LogLevel, type Logger, type LoggerConfig } from './Logger';

/** ANSI color codes for terminal output */
const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
} as const;

/**
 * Logs messages to the console with colors and formatting.
 * Useful for debugging during development.
 *
 * @example
 *   const canton = new Canton({
 *     network: 'localnet',
 *     debug: true, // Enables ConsoleLogger automatically
 *   });
 *
 *   // Or use directly:
 *   const logger = new ConsoleLogger({ logLevel: 'debug' });
 */
export class ConsoleLogger implements Logger {
  private readonly logLevel: LogLevel;
  private readonly enableColors: boolean;

  constructor(config: LoggerConfig & { colors?: boolean } = {}) {
    this.logLevel = config.logLevel ?? 'debug';
    // Enable colors by default in TTY environments
    this.enableColors = config.colors ?? Boolean(process.stdout.isTTY);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async logRequestResponse(url: string, request: unknown, response: unknown): Promise<void> {
    if (!this.shouldLog('debug')) {
      return;
    }

    const timestamp = this.formatTimestamp();
    const method = this.extractMethod(request);
    const sanitizedRequest = this.sanitizeForLogging(request);
    const sanitizedResponse = this.sanitizeForLogging(response);

    const prefix = this.colorize(`[${timestamp}]`, 'dim');
    const methodLabel = this.colorize(method, 'cyan');
    const urlLabel = this.colorize(url, 'blue');

    console.log(`${prefix} ${methodLabel} ${urlLabel}`);

    if (sanitizedRequest && Object.keys(sanitizedRequest as object).length > 0) {
      console.log(`${this.colorize('  Request:', 'gray')} ${this.formatJson(sanitizedRequest)}`);
    }

    if (sanitizedResponse !== undefined) {
      const responseStr = this.formatJson(sanitizedResponse);
      // Truncate very long responses
      const truncated = responseStr.length > 1000 ? `${responseStr.slice(0, 1000)}...` : responseStr;
      console.log(`${this.colorize('  Response:', 'gray')} ${truncated}`);
    }
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  public error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = this.formatTimestamp();
    const prefix = this.colorize(`[${timestamp}]`, 'dim');
    const levelLabel = this.formatLevel(level);

    let line = `${prefix} ${levelLabel} ${message}`;

    if (context && Object.keys(context).length > 0) {
      const sanitized = this.sanitizeForLogging(context);
      line += ` ${this.colorize(this.formatJson(sanitized), 'gray')}`;
    }

    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_VALUES[level] <= LOG_LEVEL_VALUES[this.logLevel];
  }

  private formatTimestamp(): string {
    const now = new Date();
    return now.toISOString().slice(11, 23); // HH:mm:ss.SSS
  }

  private formatLevel(level: LogLevel): string {
    const labels: Record<LogLevel, { text: string; color: keyof typeof COLORS }> = {
      error: { text: 'ERR', color: 'red' },
      warn: { text: 'WRN', color: 'yellow' },
      info: { text: 'INF', color: 'blue' },
      debug: { text: 'DBG', color: 'gray' },
    };
    const { text, color } = labels[level];
    return this.colorize(`[${text}]`, color);
  }

  private colorize(text: string, color: keyof typeof COLORS): string {
    if (!this.enableColors) {
      return text;
    }
    return `${COLORS[color]}${text}${COLORS.reset}`;
  }

  private extractMethod(request: unknown): string {
    if (request && typeof request === 'object' && 'method' in request) {
      return String((request as { method: string }).method);
    }
    return 'REQUEST';
  }

  private formatJson(obj: unknown): string {
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
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
          sanitized[key] = this.sanitizeForLogging(value);
        }
      }
      return sanitized;
    }

    return obj;
  }
}
