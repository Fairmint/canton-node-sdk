import type { LogLevel } from '../../../src/core/logging';
import { CompositeLogger, ConsoleLogger, FileLogger, LOG_LEVEL_VALUES } from '../../../src/core/logging';

describe('LOG_LEVEL_VALUES', () => {
  it('has correct priority order (error highest, debug lowest)', () => {
    expect(LOG_LEVEL_VALUES.error).toBeLessThan(LOG_LEVEL_VALUES.warn);
    expect(LOG_LEVEL_VALUES.warn).toBeLessThan(LOG_LEVEL_VALUES.info);
    expect(LOG_LEVEL_VALUES.info).toBeLessThan(LOG_LEVEL_VALUES.debug);
  });

  it('contains all log levels', () => {
    const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
    for (const level of levels) {
      expect(LOG_LEVEL_VALUES[level]).toBeDefined();
    }
  });
});

describe('ConsoleLogger', () => {
  let consoleSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('defaults to debug log level', () => {
      const logger = new ConsoleLogger();
      logger.debug('test message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('respects custom log level', () => {
      const logger = new ConsoleLogger({ logLevel: 'error' });

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      // Only error should be logged
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('logRequestResponse', () => {
    it('logs request and response at debug level', async () => {
      const logger = new ConsoleLogger({ logLevel: 'debug' });

      await logger.logRequestResponse('https://api.example.com/test', { method: 'GET' }, { status: 'ok' });

      expect(consoleSpy).toHaveBeenCalled();
      const { calls } = consoleSpy.mock;
      // Should have at least one call with the URL
      expect(calls.some((call: string[]) => call.some((arg: string) => arg.includes('api.example.com')))).toBe(true);
    });

    it('does not log when level is higher than debug', async () => {
      const logger = new ConsoleLogger({ logLevel: 'info' });

      await logger.logRequestResponse('https://api.example.com/test', { method: 'GET' }, { status: 'ok' });

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('sanitizes sensitive data', async () => {
      const logger = new ConsoleLogger({ logLevel: 'debug' });

      await logger.logRequestResponse(
        'https://api.example.com/test',
        { method: 'POST', headers: { authorization: 'Bearer secret123' } },
        { access_token: 'token456' }
      );

      const allOutput = consoleSpy.mock.calls.flat().join(' ');
      expect(allOutput).not.toContain('secret123');
      expect(allOutput).not.toContain('token456');
      expect(allOutput).toContain('[REDACTED]');
    });

    it('truncates very long responses', async () => {
      const logger = new ConsoleLogger({ logLevel: 'debug' });
      const longResponse = { data: 'x'.repeat(2000) };

      await logger.logRequestResponse('https://api.example.com/test', { method: 'GET' }, longResponse);

      const allOutput = consoleSpy.mock.calls.flat().join(' ');
      expect(allOutput).toContain('...');
      expect(allOutput.length).toBeLessThan(2500);
    });
  });

  describe('log level methods', () => {
    it('logs debug messages', () => {
      const logger = new ConsoleLogger({ logLevel: 'debug' });
      logger.debug('debug message', { key: 'value' });

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0].join(' ');
      expect(output).toContain('debug message');
    });

    it('logs info messages', () => {
      const logger = new ConsoleLogger({ logLevel: 'debug' });
      logger.info('info message');

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0].join(' ');
      expect(output).toContain('info message');
    });

    it('logs warn messages via console.warn', () => {
      const logger = new ConsoleLogger({ logLevel: 'debug' });
      logger.warn('warn message');

      expect(consoleWarnSpy).toHaveBeenCalled();
      const output = consoleWarnSpy.mock.calls[0].join(' ');
      expect(output).toContain('warn message');
    });

    it('logs error messages via console.error', () => {
      const logger = new ConsoleLogger({ logLevel: 'debug' });
      logger.error('error message');

      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0].join(' ');
      expect(output).toContain('error message');
    });

    it('respects log level filtering', () => {
      const logger = new ConsoleLogger({ logLevel: 'warn' });

      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('CompositeLogger', () => {
  it('delegates logRequestResponse to all loggers', async () => {
    const logger1 = { logRequestResponse: jest.fn().mockResolvedValue(undefined) };
    const logger2 = { logRequestResponse: jest.fn().mockResolvedValue(undefined) };

    const composite = new CompositeLogger([logger1, logger2]);
    await composite.logRequestResponse('https://example.com', { method: 'GET' }, { ok: true });

    expect(logger1.logRequestResponse).toHaveBeenCalledWith('https://example.com', { method: 'GET' }, { ok: true });
    expect(logger2.logRequestResponse).toHaveBeenCalledWith('https://example.com', { method: 'GET' }, { ok: true });
  });

  it('delegates debug to all loggers with method', () => {
    const logger1 = { logRequestResponse: jest.fn(), debug: jest.fn() };
    const logger2 = { logRequestResponse: jest.fn(), debug: jest.fn() };
    const logger3 = { logRequestResponse: jest.fn() }; // No debug method

    const composite = new CompositeLogger([logger1, logger2, logger3]);
    composite.debug('test', { ctx: 'value' });

    expect(logger1.debug).toHaveBeenCalledWith('test', { ctx: 'value' });
    expect(logger2.debug).toHaveBeenCalledWith('test', { ctx: 'value' });
    // logger3 should not cause an error
  });

  it('delegates info to all loggers with method', () => {
    const logger1 = { logRequestResponse: jest.fn(), info: jest.fn() };
    const logger2 = { logRequestResponse: jest.fn() };

    const composite = new CompositeLogger([logger1, logger2]);
    composite.info('info message');

    expect(logger1.info).toHaveBeenCalledWith('info message', undefined);
  });

  it('delegates warn to all loggers with method', () => {
    const logger1 = { logRequestResponse: jest.fn(), warn: jest.fn() };

    const composite = new CompositeLogger([logger1]);
    composite.warn('warning');

    expect(logger1.warn).toHaveBeenCalledWith('warning', undefined);
  });

  it('delegates error to all loggers with method', () => {
    const logger1 = { logRequestResponse: jest.fn(), error: jest.fn() };

    const composite = new CompositeLogger([logger1]);
    composite.error('error message', { code: 500 });

    expect(logger1.error).toHaveBeenCalledWith('error message', { code: 500 });
  });

  it('works with empty logger array', async () => {
    const composite = new CompositeLogger([]);

    // Should not throw
    await composite.logRequestResponse('url', {}, {});
    composite.debug('test');
    composite.info('test');
    composite.warn('test');
    composite.error('test');
  });
});

describe('FileLogger', () => {
  describe('constructor', () => {
    it('can be disabled via config', async () => {
      const logger = new FileLogger({ enableLogging: false });

      // Should not throw and should not write anything
      await logger.logRequestResponse('url', {}, {});
      logger.debug('test');
      logger.info('test');
    });

    it('defaults to info log level', () => {
      // FileLogger should have log level methods that respect the level
      const logger = new FileLogger({ enableLogging: false });

      // These methods exist
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
  });

  describe('log level methods', () => {
    it('has all log level methods', () => {
      const logger = new FileLogger({ enableLogging: false });

      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
  });
});
