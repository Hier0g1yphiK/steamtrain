// Feature: steam-discord-bot, Property 11: Error log truncation
// **Validates: Requirements 7.4, 7.5**

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { ApiError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

describe('Property 11: Error log truncation', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('ApiError truncates responseBody to at most 1024 characters for any string input', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 5000 }), (body) => {
        const error = new ApiError('Test error', 500, body);
        expect(error.responseBody.length).toBeLessThanOrEqual(1024);
        if (body.length <= 1024) {
          expect(error.responseBody).toBe(body);
        } else {
          expect(error.responseBody).toBe(body.slice(0, 1024));
        }
      }),
      { numRuns: 100 }
    );
  });

  it('logger.error truncates responseBody to at most 1024 characters in logged output', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 5000 }), (body) => {
        consoleErrorSpy.mockClear();

        logger.error({
          command: 'test',
          input: 'test-input',
          error: new Error('test'),
          responseBody: body,
        });

        expect(consoleErrorSpy).toHaveBeenCalledOnce();
        const loggedJson = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

        expect(loggedJson.responseBody.length).toBeLessThanOrEqual(1024);
        if (body.length <= 1024) {
          expect(loggedJson.responseBody).toBe(body);
        } else {
          expect(loggedJson.responseBody).toBe(body.slice(0, 1024));
        }
      }),
      { numRuns: 100 }
    );
  });

  it('logger.error with ApiError truncates responseBody from the error object', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 5000 }), (body) => {
        consoleErrorSpy.mockClear();

        const apiError = new ApiError('Steam API returned 500', 500, body);
        logger.error({
          command: 'game',
          input: 'test-game',
          error: apiError,
        });

        expect(consoleErrorSpy).toHaveBeenCalledOnce();
        const loggedJson = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

        // responseBody in logged output must be at most 1024 chars
        expect(loggedJson.responseBody.length).toBeLessThanOrEqual(1024);
      }),
      { numRuns: 100 }
    );
  });

  it('user-facing error message from ApiError does not contain the raw response body', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 5000 }),
        fc.integer({ min: 400, max: 599 }),
        (body, statusCode) => {
          const apiError = new ApiError(
            `Steam API returned ${statusCode}`,
            statusCode,
            body
          );

          // The user-facing message is the error.message property.
          // It must NOT contain the raw response body.
          const userMessage = apiError.message;
          expect(userMessage).not.toContain(body);
        }
      ),
      { numRuns: 100 }
    );
  });
});
