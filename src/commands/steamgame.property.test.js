// Feature: steam-discord-bot, Property 1: Game name validation boundary
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateGameName } from './steamgame.js';

/**
 * Validates: Requirements 1.1, 1.2
 *
 * Property 1: Game name validation boundary
 * For any string, validation accepts if trimmed length is 1-200 chars;
 * rejects with error otherwise.
 */
describe('Property 1: Game name validation boundary', () => {
  it('accepts any string whose trimmed length is between 1 and 200', () => {
    const validName = fc
      .string({ minLength: 1, maxLength: 200 })
      .filter((s) => s.trim().length >= 1 && s.trim().length <= 200);

    fc.assert(
      fc.property(validName, (name) => {
        const result = validateGameName(name);
        expect(result.valid).toBe(true);
        expect(result.trimmed).toBe(name.trim());
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('rejects empty strings and whitespace-only strings', () => {
    const emptyName = fc.oneof(
      fc.constant(''),
      fc.stringOf(fc.constant(' '), { minLength: 1, maxLength: 50 }),
      fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 50 }),
    );

    fc.assert(
      fc.property(emptyName, (name) => {
        const result = validateGameName(name);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects strings whose trimmed length exceeds 200', () => {
    const tooLongName = fc
      .string({ minLength: 201, maxLength: 500 })
      .filter((s) => s.trim().length > 200);

    fc.assert(
      fc.property(tooLongName, (name) => {
        const result = validateGameName(name);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects non-string inputs', () => {
    const nonString = fc.oneof(
      fc.integer(),
      fc.constant(null),
      fc.constant(undefined),
      fc.boolean(),
      fc.object(),
      fc.array(fc.anything()),
    );

    fc.assert(
      fc.property(nonString, (input) => {
        const result = validateGameName(input);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 100 },
    );
  });

  it('trimmed field always equals input.trim() for valid results', () => {
    const anyString = fc.string({ minLength: 0, maxLength: 300 });

    fc.assert(
      fc.property(anyString, (name) => {
        const result = validateGameName(name);
        const trimmed = name.trim();
        expect(result.trimmed).toBe(trimmed);

        if (trimmed.length >= 1 && trimmed.length <= 200) {
          expect(result.valid).toBe(true);
        } else {
          expect(result.valid).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
