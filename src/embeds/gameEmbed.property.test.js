// Feature: steam-discord-bot, Property 3: Game embed completeness
// Feature: steam-discord-bot, Property 4: Price display formatting

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildGameEmbed } from './gameEmbed.js';

/**
 * Property 3: Game embed completeness and conditional fields
 * Validates: Requirements 2.2, 2.8, 2.9
 *
 * For any valid GameDetails object, the generated embed SHALL contain:
 * game title, header image, short description, genres, developers, publishers,
 * release date, and price. Metacritic is included only when non-null.
 */

/**
 * Property 4: Price display formatting
 * Validates: Requirements 2.3, 2.4, 2.5
 *
 * For any GameDetails object:
 * - Free-to-play → "Free to Play"
 * - Discounted → strikethrough original, current, and discount %
 * - Full price → "£X.XX"
 */

/** Generator for a valid price object (non-free game, no discount) */
const fullPriceArb = fc.record({
  currency: fc.constant('GBP'),
  current: fc.integer({ min: 1, max: 99999 }),
  original: fc.constant(null),
  discountPercent: fc.constant(0),
});

/** Generator for a discounted price object */
const discountedPriceArb = fc.integer({ min: 1, max: 99999 }).chain((current) =>
  fc.record({
    currency: fc.constant('GBP'),
    current: fc.constant(current),
    original: fc.integer({ min: current + 1, max: 100000 }),
    discountPercent: fc.integer({ min: 1, max: 99 }),
  })
);

/** Generator for a free-to-play GameDetails */
const freeGameDetailsArb = fc.record({
  appId: fc.nat({ max: 999999 }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  shortDescription: fc.string({ minLength: 1, maxLength: 300 }),
  headerImage: fc.webUrl(),
  genres: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
  developers: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
  publishers: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
  releaseDate: fc.string({ minLength: 1, maxLength: 30 }),
  isFreeToPlay: fc.constant(true),
  price: fc.constant(null),
  metacriticScore: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 100 })),
  storeUrl: fc.webUrl(),
});

/** Generator for a paid GameDetails (no discount) */
const fullPriceGameDetailsArb = fc.record({
  appId: fc.nat({ max: 999999 }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  shortDescription: fc.string({ minLength: 1, maxLength: 300 }),
  headerImage: fc.webUrl(),
  genres: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
  developers: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
  publishers: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
  releaseDate: fc.string({ minLength: 1, maxLength: 30 }),
  isFreeToPlay: fc.constant(false),
  price: fullPriceArb,
  metacriticScore: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 100 })),
  storeUrl: fc.webUrl(),
});

/** Generator for a discounted GameDetails */
const discountedGameDetailsArb = fc.record({
  appId: fc.nat({ max: 999999 }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  shortDescription: fc.string({ minLength: 1, maxLength: 300 }),
  headerImage: fc.webUrl(),
  genres: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
  developers: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
  publishers: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
  releaseDate: fc.string({ minLength: 1, maxLength: 30 }),
  isFreeToPlay: fc.constant(false),
  price: discountedPriceArb,
  metacriticScore: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 100 })),
  storeUrl: fc.webUrl(),
});

/** Combined generator for any valid GameDetails */
const gameDetailsArb = fc.oneof(
  freeGameDetailsArb,
  fullPriceGameDetailsArb,
  discountedGameDetailsArb
);

describe('Property 3: Game embed completeness and conditional fields', () => {
  it('embed always contains title, URL, image, description, genres, developers, publishers, release date, and price fields', () => {
    fc.assert(
      fc.property(gameDetailsArb, (gameDetails) => {
        const embed = buildGameEmbed(gameDetails);
        const data = embed.toJSON();

        // Title and URL
        expect(data.title).toBe(gameDetails.name);
        expect(data.url).toBe(gameDetails.storeUrl);

        // Image
        expect(data.image).toBeDefined();
        expect(data.image.url).toBe(gameDetails.headerImage);

        // Description
        expect(data.description).toBe(gameDetails.shortDescription);

        // Required fields
        const fieldNames = data.fields.map((f) => f.name);
        expect(fieldNames).toContain('Genres');
        expect(fieldNames).toContain('Developers');
        expect(fieldNames).toContain('Publishers');
        expect(fieldNames).toContain('Release Date');
        expect(fieldNames).toContain('Price');
      }),
      { numRuns: 100 }
    );
  });

  it('includes Metacritic field when metacriticScore is non-null', () => {
    const withMetacritic = fc.record({
      appId: fc.nat({ max: 999999 }),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      shortDescription: fc.string({ minLength: 1, maxLength: 300 }),
      headerImage: fc.webUrl(),
      genres: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
      developers: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
      publishers: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
      releaseDate: fc.string({ minLength: 1, maxLength: 30 }),
      isFreeToPlay: fc.constant(true),
      price: fc.constant(null),
      metacriticScore: fc.integer({ min: 0, max: 100 }),
      storeUrl: fc.webUrl(),
    });

    fc.assert(
      fc.property(withMetacritic, (gameDetails) => {
        const embed = buildGameEmbed(gameDetails);
        const data = embed.toJSON();
        const metacriticField = data.fields.find((f) => f.name === 'Metacritic');

        expect(metacriticField).toBeDefined();
        expect(metacriticField.value).toBe(String(gameDetails.metacriticScore));
      }),
      { numRuns: 100 }
    );
  });

  it('omits Metacritic field when metacriticScore is null', () => {
    const withoutMetacritic = fc.record({
      appId: fc.nat({ max: 999999 }),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      shortDescription: fc.string({ minLength: 1, maxLength: 300 }),
      headerImage: fc.webUrl(),
      genres: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
      developers: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
      publishers: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 1, maxLength: 3 }),
      releaseDate: fc.string({ minLength: 1, maxLength: 30 }),
      isFreeToPlay: fc.constant(true),
      price: fc.constant(null),
      metacriticScore: fc.constant(null),
      storeUrl: fc.webUrl(),
    });

    fc.assert(
      fc.property(withoutMetacritic, (gameDetails) => {
        const embed = buildGameEmbed(gameDetails);
        const data = embed.toJSON();
        const metacriticField = data.fields.find((f) => f.name === 'Metacritic');

        expect(metacriticField).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 4: Price display formatting', () => {
  it('displays "Free to Play" when isFreeToPlay is true', () => {
    fc.assert(
      fc.property(freeGameDetailsArb, (gameDetails) => {
        const embed = buildGameEmbed(gameDetails);
        const data = embed.toJSON();
        const priceField = data.fields.find((f) => f.name === 'Price');

        expect(priceField).toBeDefined();
        expect(priceField.value).toBe('Free to Play');
      }),
      { numRuns: 100 }
    );
  });

  it('displays strikethrough original, current price, and discount % when discounted', () => {
    fc.assert(
      fc.property(discountedGameDetailsArb, (gameDetails) => {
        const embed = buildGameEmbed(gameDetails);
        const data = embed.toJSON();
        const priceField = data.fields.find((f) => f.name === 'Price');

        expect(priceField).toBeDefined();

        const { current, original, discountPercent } = gameDetails.price;
        const expectedOriginal = `£${(original / 100).toFixed(2)}`;
        const expectedCurrent = `£${(current / 100).toFixed(2)}`;
        const expected = `~~${expectedOriginal}~~ ${expectedCurrent} (-${discountPercent}%)`;

        expect(priceField.value).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  it('displays "£X.XX" when no discount is active', () => {
    fc.assert(
      fc.property(fullPriceGameDetailsArb, (gameDetails) => {
        const embed = buildGameEmbed(gameDetails);
        const data = embed.toJSON();
        const priceField = data.fields.find((f) => f.name === 'Price');

        expect(priceField).toBeDefined();

        const expected = `£${(gameDetails.price.current / 100).toFixed(2)}`;
        expect(priceField.value).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });
});
