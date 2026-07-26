// Feature: steam-discord-bot, Property 5: Steam user input format detection
// **Validates: Requirements 3.1, 3.2, 3.3**

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { UserResolveService } from './userResolve.js';

/**
 * Creates a mock SteamClient that tracks whether resolveVanityURL was called.
 */
function createTrackingMockClient() {
  return {
    resolveVanityURL: vi.fn().mockResolvedValue({
      response: { success: 1, steamid: '76561198000000000' },
    }),
  };
}

/**
 * Generates a 17-digit numeric string.
 */
const steamId64Arb = fc
  .stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
    minLength: 17,
    maxLength: 17,
  });

/**
 * Generates a non-empty vanity name string that:
 * - Is not a 17-digit number
 * - Does not look like a Steam URL
 */
const vanityNameArb = fc
  .string({ minLength: 1, maxLength: 50, unit: 'grapheme' })
  .filter((s) => {
    const trimmed = s.trim();
    if (trimmed.length === 0) return false;
    // Must not be a 17-digit number
    if (/^\d{17}$/.test(trimmed)) return false;
    // Must not look like a steam URL
    if (/^https?:\/\/steamcommunity\.com\//i.test(trimmed)) return false;
    return true;
  });

/**
 * Generates a non-empty vanity segment for use in URLs (no slashes, non-empty after trim).
 */
const vanitySegmentArb = fc
  .string({ minLength: 1, maxLength: 30, unit: 'grapheme' })
  .filter((s) => !s.includes('/') && s.trim().length > 0);

describe('Property 5: Steam user input format detection', () => {
  it('profile URL with 17-digit number extracts SteamID64 directly without calling resolveVanityURL', async () => {
    await fc.assert(
      fc.asyncProperty(steamId64Arb, async (id) => {
        const client = createTrackingMockClient();
        const service = new UserResolveService(client);
        const input = `https://steamcommunity.com/profiles/${id}`;

        const result = await service.resolve(input);

        expect(result).toEqual({ steamId64: id });
        expect(client.resolveVanityURL).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  it('vanity URL routes to vanity resolution (resolveVanityURL IS called)', async () => {
    await fc.assert(
      fc.asyncProperty(vanitySegmentArb, async (name) => {
        const client = createTrackingMockClient();
        const service = new UserResolveService(client);
        const input = `https://steamcommunity.com/id/${name}`;

        await service.resolve(input);

        // The service trims the entire input before regex matching,
        // so trailing whitespace on the vanity segment is stripped.
        const expectedName = input.trim().match(/\/id\/([^/]+)\/?$/)?.[1] ?? name;
        expect(client.resolveVanityURL).toHaveBeenCalledWith(expectedName);
      }),
      { numRuns: 100 }
    );
  });

  it('raw 17-digit numeric string is used directly as SteamID64 without calling resolveVanityURL', async () => {
    await fc.assert(
      fc.asyncProperty(steamId64Arb, async (id) => {
        const client = createTrackingMockClient();
        const service = new UserResolveService(client);

        const result = await service.resolve(id);

        expect(result).toEqual({ steamId64: id });
        expect(client.resolveVanityURL).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  it('arbitrary vanity name string routes to vanity resolution (resolveVanityURL IS called)', async () => {
    await fc.assert(
      fc.asyncProperty(vanityNameArb, async (name) => {
        const client = createTrackingMockClient();
        const service = new UserResolveService(client);

        await service.resolve(name);

        expect(client.resolveVanityURL).toHaveBeenCalledWith(name.trim());
      }),
      { numRuns: 100 }
    );
  });

  it('input format detection is exhaustive — all inputs route to one of the four paths', async () => {
    const allInputsArb = fc.oneof(
      // Profile URLs
      steamId64Arb.map((id) => ({
        input: `https://steamcommunity.com/profiles/${id}`,
        expectVanityCall: false,
        expectedId: id,
      })),
      // Vanity URLs
      vanitySegmentArb.map((name) => ({
        input: `https://steamcommunity.com/id/${name}`,
        expectVanityCall: true,
        expectedId: null,
      })),
      // Raw SteamID64
      steamId64Arb.map((id) => ({
        input: id,
        expectVanityCall: false,
        expectedId: id,
      })),
      // Arbitrary vanity names
      vanityNameArb.map((name) => ({
        input: name,
        expectVanityCall: true,
        expectedId: null,
      }))
    );

    await fc.assert(
      fc.asyncProperty(allInputsArb, async ({ input, expectVanityCall, expectedId }) => {
        const client = createTrackingMockClient();
        const service = new UserResolveService(client);

        const result = await service.resolve(input);

        if (expectVanityCall) {
          expect(client.resolveVanityURL).toHaveBeenCalled();
          expect(result).toEqual({ steamId64: '76561198000000000' });
        } else {
          expect(client.resolveVanityURL).not.toHaveBeenCalled();
          expect(result).toEqual({ steamId64: expectedId });
        }
      }),
      { numRuns: 100 }
    );
  });
});
