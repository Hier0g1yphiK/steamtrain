import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from './logger.js';
import { ApiError, TimeoutError } from './errors.js';

describe('Logger', () => {
  let errorSpy;
  let warnSpy;
  let infoSpy;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('error logging', () => {
    it('logs structured error with command, input, errorType, errorMessage', () => {
      const error = new TimeoutError('timed out');
      logger.error({
        command: 'game',
        input: 'Half-Life 3',
        error,
      });

      expect(errorSpy).toHaveBeenCalledOnce();
      const logged = JSON.parse(errorSpy.mock.calls[0][0]);
      expect(logged.command).toBe('game');
      expect(logged.input).toBe('Half-Life 3');
      expect(logged.errorType).toBe('TimeoutError');
      expect(logged.errorMessage).toBe('timed out');
      expect(logged.timestamp).toBeDefined();
    });

    it('includes statusCode and responseBody from ApiError', () => {
      const error = new ApiError('Server error', 503, '{"detail":"down"}');
      logger.error({
        command: 'steamuser',
        input: 'someuser',
        error,
      });

      const logged = JSON.parse(errorSpy.mock.calls[0][0]);
      expect(logged.statusCode).toBe(503);
      expect(logged.responseBody).toBe('{"detail":"down"}');
    });

    it('truncates responseBody to 1024 characters', () => {
      const longBody = 'a'.repeat(2000);
      logger.error({
        command: 'game',
        input: 'test',
        error: new Error('fail'),
        responseBody: longBody,
      });

      const logged = JSON.parse(errorSpy.mock.calls[0][0]);
      expect(logged.responseBody.length).toBe(1024);
    });

    it('never includes DISCORD_TOKEN in logs', () => {
      const originalToken = process.env.DISCORD_TOKEN;
      process.env.DISCORD_TOKEN = 'super-secret-token-123';

      try {
        const error = new Error(
          'Connection failed with token super-secret-token-123'
        );
        logger.error({
          command: 'game',
          input: 'some input with super-secret-token-123 in it',
          error,
        });

        const logged = errorSpy.mock.calls[0][0];
        expect(logged).not.toContain('super-secret-token-123');
        expect(logged).toContain('[REDACTED]');
      } finally {
        if (originalToken) {
          process.env.DISCORD_TOKEN = originalToken;
        } else {
          delete process.env.DISCORD_TOKEN;
        }
      }
    });

    it('never includes STEAM_API_KEY in logs', () => {
      const originalKey = process.env.STEAM_API_KEY;
      process.env.STEAM_API_KEY = 'my-steam-api-key-456';

      try {
        const error = new Error('API call with key my-steam-api-key-456');
        logger.error({
          command: 'steamuser',
          input: 'query containing my-steam-api-key-456',
          error,
        });

        const logged = errorSpy.mock.calls[0][0];
        expect(logged).not.toContain('my-steam-api-key-456');
        expect(logged).toContain('[REDACTED]');
      } finally {
        if (originalKey) {
          process.env.STEAM_API_KEY = originalKey;
        } else {
          delete process.env.STEAM_API_KEY;
        }
      }
    });
  });

  describe('warn logging', () => {
    it('logs a string message', () => {
      logger.warn('cache miss');
      const logged = JSON.parse(warnSpy.mock.calls[0][0]);
      expect(logged.message).toBe('cache miss');
      expect(logged.timestamp).toBeDefined();
    });

    it('logs an object', () => {
      logger.warn({ message: 'stale cache served', key: 'game:123' });
      const logged = JSON.parse(warnSpy.mock.calls[0][0]);
      expect(logged.message).toBe('stale cache served');
      expect(logged.key).toBe('game:123');
    });
  });

  describe('info logging', () => {
    it('logs a string message', () => {
      logger.info('bot started');
      const logged = JSON.parse(infoSpy.mock.calls[0][0]);
      expect(logged.message).toBe('bot started');
      expect(logged.timestamp).toBeDefined();
    });

    it('logs an object', () => {
      logger.info({ event: 'command_registered', name: 'game' });
      const logged = JSON.parse(infoSpy.mock.calls[0][0]);
      expect(logged.event).toBe('command_registered');
      expect(logged.name).toBe('game');
    });
  });
});
