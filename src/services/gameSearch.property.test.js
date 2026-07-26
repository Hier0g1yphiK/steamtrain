// Feature: steam-discord-bot, Property 2: Search result threshold routing

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { applyThresholdRouting } from './gameSearch.js';

/**
 * Property 2: Search result threshold routing
 * Validates: Requirements 1.4, 1.5, 1.7
 *
 * For any non-empty list of results with similarity scores, the selection
 * algorithm correctly auto-selects, returns candidates, or returns no results
 * based on thresholds.
 */

/** Generator for a single GameResult */
const gameResultArb = fc.record({
  appId: fc.nat({ max: 999999 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  similarity: fc.integer({ min: 0, max: 100 }),
});

/** Generator for a non-empty list of GameResults */
const nonEmptyResultsArb = fc.array(gameResultArb, { minLength: 1, maxLength: 20 });

describe('Property 2: Search result threshold routing', () => {
  it('auto-selects when exactly one result has similarity >= 90%', () => {
    // Generate exactly one result with similarity >= 90 and rest below 90
    const highResult = fc.record({
      appId: fc.nat({ max: 999999 }),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      similarity: fc.integer({ min: 90, max: 100 }),
    });

    const lowResult = fc.record({
      appId: fc.nat({ max: 999999 }),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      similarity: fc.integer({ min: 0, max: 89 }),
    });

    fc.assert(
      fc.property(
        highResult,
        fc.array(lowResult, { minLength: 0, maxLength: 10 }),
        (high, lows) => {
          const results = [high, ...lows];
          const { match, candidates } = applyThresholdRouting(results);

          expect(match).toEqual(high);
          expect(candidates).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns candidates (not auto-select) when multiple results have similarity >= 90%', () => {
    const highResult = fc.record({
      appId: fc.nat({ max: 999999 }),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      similarity: fc.integer({ min: 90, max: 100 }),
    });

    fc.assert(
      fc.property(
        fc.array(highResult, { minLength: 2, maxLength: 10 }),
        (highResults) => {
          const { match, candidates } = applyThresholdRouting(highResults);

          // Multiple >= 90% results are treated as candidates, not auto-selected
          expect(match).toBeNull();
          expect(candidates.length).toBeGreaterThanOrEqual(2);
          expect(candidates.length).toBeLessThanOrEqual(5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns top 5 candidates when 2+ results have similarity > 60%', () => {
    // Generate results where no single one >= 90 but at least 2 are > 60
    const aboveThresholdResult = fc.record({
      appId: fc.nat({ max: 999999 }),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      similarity: fc.integer({ min: 61, max: 89 }),
    });

    const belowThresholdResult = fc.record({
      appId: fc.nat({ max: 999999 }),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      similarity: fc.integer({ min: 0, max: 60 }),
    });

    fc.assert(
      fc.property(
        fc.array(aboveThresholdResult, { minLength: 2, maxLength: 15 }),
        fc.array(belowThresholdResult, { minLength: 0, maxLength: 5 }),
        (aboveResults, belowResults) => {
          const results = [...aboveResults, ...belowResults];
          const { match, candidates } = applyThresholdRouting(results);

          expect(match).toBeNull();
          expect(candidates.length).toBeGreaterThanOrEqual(2);
          expect(candidates.length).toBeLessThanOrEqual(5);

          // All candidates should have similarity > 60
          for (const c of candidates) {
            expect(c.similarity).toBeGreaterThan(60);
          }

          // Candidates should be sorted descending by similarity
          for (let i = 1; i < candidates.length; i++) {
            expect(candidates[i - 1].similarity).toBeGreaterThanOrEqual(candidates[i].similarity);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns no matches when no results have similarity > 60%', () => {
    const lowResult = fc.record({
      appId: fc.nat({ max: 999999 }),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      similarity: fc.integer({ min: 0, max: 60 }),
    });

    fc.assert(
      fc.property(
        fc.array(lowResult, { minLength: 1, maxLength: 20 }),
        (results) => {
          const { match, candidates } = applyThresholdRouting(results);

          expect(match).toBeNull();
          expect(candidates).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('candidates list never exceeds 5 entries', () => {
    fc.assert(
      fc.property(
        nonEmptyResultsArb,
        (results) => {
          const { candidates } = applyThresholdRouting(results);
          expect(candidates.length).toBeLessThanOrEqual(5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('match and candidates are mutually exclusive: match implies empty candidates', () => {
    fc.assert(
      fc.property(
        nonEmptyResultsArb,
        (results) => {
          const { match, candidates } = applyThresholdRouting(results);

          if (match !== null) {
            expect(candidates).toEqual([]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty or null input returns match null and empty candidates', () => {
    expect(applyThresholdRouting([])).toEqual({ match: null, candidates: [] });
    expect(applyThresholdRouting(null)).toEqual({ match: null, candidates: [] });
    expect(applyThresholdRouting(undefined)).toEqual({ match: null, candidates: [] });
  });
});
