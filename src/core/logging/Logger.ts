/**
 * Log levels for the logging system.
 *
 * - Error: Critical errors that need immediate attention
 * - Warn: Warning conditions that may indicate problems
 * - Info: Informational messages about normal operation
 * - Debug: Detailed debug information for development
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/** Numeric values for log levels, used for filtering. Lower number = higher priority. */
export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

/**
 * Logger interface for SDK operations.
 *
 * Implementations can log to files, console, or external services.
 */
export interface Logger {
  /** Logs an API request and its response. This is the primary logging method used by HttpClient. */
  logRequestResponse(url: string, request: unknown, response: unknown): Promise<void>;

  /** Logs a debug message. Only shown when log level is 'debug'. Use for detailed information useful during development. */
  debug?(message: string, context?: Record<string, unknown>): void;

  /** Logs an info message. Shown at 'info' and 'debug' levels. Use for general operational information. */
  info?(message: string, context?: Record<string, unknown>): void;

  /** Logs a warning message. Shown at 'warn', 'info', and 'debug' levels. Use for potentially problematic situations. */
  warn?(message: string, context?: Record<string, unknown>): void;

  /** Logs an error message. Always shown. Use for errors and exceptions. */
  error?(message: string, context?: Record<string, unknown>): void;
}

export interface LoggerConfig {
  /** Enable or disable logging (default: true) */
  enableLogging?: boolean;
  /** Directory for log files (FileLogger only) */
  logDir?: string;
  /** Minimum log level to output (default: 'info') */
  logLevel?: LogLevel;
}
