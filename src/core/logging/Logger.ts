/** Log level priority values. Lower number = higher priority. */
export const LogLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

/**
 * Log levels ordered by priority: `error` > `warn` > `info` > `debug`.
 *
 * Messages are shown when their level is at or above the configured minimum.
 */
export type LogLevel = keyof typeof LogLevels;

/** @deprecated Use LogLevels instead */
export const LOG_LEVEL_VALUES: Record<LogLevel, number> = LogLevels;

/**
 * Logger interface for SDK operations.
 *
 * The SDK ships with three implementations:
 *
 * - {@link FileLogger} - Writes JSON logs to disk (default)
 * - {@link ConsoleLogger} - Prints to stdout/stderr
 * - {@link CompositeLogger} - Delegates to multiple loggers
 *
 * Provide a custom implementation to integrate with your logging infrastructure.
 */
export interface Logger {
  /** Logs an API request and its response. Called by HttpClient for every HTTP call. */
  logRequestResponse(url: string, request: unknown, response: unknown): Promise<void>;

  /** Logs a debug message. Only shown when log level is `'debug'`. */
  debug?(message: string, context?: Record<string, unknown>): void;

  /** Logs an info message. Shown at `'info'` and `'debug'` levels. */
  info?(message: string, context?: Record<string, unknown>): void;

  /** Logs a warning. Shown at `'warn'`, `'info'`, and `'debug'` levels. */
  warn?(message: string, context?: Record<string, unknown>): void;

  /** Logs an error. Always shown regardless of log level. */
  error?(message: string, context?: Record<string, unknown>): void;
}

export interface LoggerConfig {
  /** Enable or disable logging (default: true). */
  readonly enableLogging?: boolean;
  /** Directory for log files (FileLogger only). */
  readonly logDir?: string;
  /** Minimum log level to output (default: 'info'). */
  readonly logLevel?: LogLevel;
}
