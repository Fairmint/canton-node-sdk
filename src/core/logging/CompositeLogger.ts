import { type Logger } from './Logger';

/**
 * Combines multiple loggers, delegating all log calls to each.
 *
 * @example
 *   const logger = new CompositeLogger([
 *     new FileLogger(),
 *     new ConsoleLogger({ logLevel: 'debug' }),
 *   ]);
 */
export class CompositeLogger implements Logger {
  private readonly loggers: Logger[];

  constructor(loggers: Logger[]) {
    this.loggers = loggers;
  }

  public async logRequestResponse(url: string, request: unknown, response: unknown): Promise<void> {
    await Promise.all(this.loggers.map(async (logger) => logger.logRequestResponse(url, request, response)));
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    for (const logger of this.loggers) {
      logger.debug?.(message, context);
    }
  }

  public info(message: string, context?: Record<string, unknown>): void {
    for (const logger of this.loggers) {
      logger.info?.(message, context);
    }
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    for (const logger of this.loggers) {
      logger.warn?.(message, context);
    }
  }

  public error(message: string, context?: Record<string, unknown>): void {
    for (const logger of this.loggers) {
      logger.error?.(message, context);
    }
  }
}
