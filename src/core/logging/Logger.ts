export interface Logger {
  logRequestResponse(
    url: string,
    request: unknown,
    response: unknown
  ): Promise<void>;
}

export interface LoggerConfig {
  enableLogging?: boolean;
  logDir?: string;
} 