import { describe, it, expect } from 'vitest';
import { buildGameEmbed } from './gameEmbed.js';

function makeGameDetails(overrides = {}) {
  return {
    appId: 730,
    name: 'Counter-Strike 2',
    shortDescription: 'A competitive FPS game.',
    headerImage: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg',
    genres: ['Action', 'FPS'],
    developers: ['Valve'],
    publishers: ['Valve'],
    releaseDate: '21 Aug, 2012',
    isFreeToPlay: true,
    price: null,
    metacriticScore: 83,
    storeUrl: 'https://store.steampowered.com/app/730',
    ...overrides,
  };
}

describe('buildGameEmbed', () => {
  it('sets the title to the game name linked to the store URL', () => {
    const embed = buildGameEmbed(makeGameDetails());
    const data = embed.toJSON();

    expect(data.title).toBe('Counter-Strike 2');
    expect(data.url).toBe('https://store.steampowered.com/app/730');
  });

  it('sets the header image', () => {
    const embed = buildGameEmbed(makeGameDetails());
    const data = embed.toJSON();

    expect(data.image.url).toBe('https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg');
  });

  it('sets the short description', () => {
    const embed = buildGameEmbed(makeGameDetails());
    const data = embed.toJSON();

    expect(data.description).toBe('A competitive FPS game.');
  });

  it('includes genres, developers, publishers, and release date fields', () => {
    const embed = buildGameEmbed(makeGameDetails());
    const data = embed.toJSON();
    const fieldMap = Object.fromEntries(data.fields.map((f) => [f.name, f.value]));

    expect(fieldMap['Genres']).toBe('Action, FPS');
    expect(fieldMap['Developers']).toBe('Valve');
    expect(fieldMap['Publishers']).toBe('Valve');
    expect(fieldMap['Release Date']).toBe('21 Aug, 2012');
  });

  it('displays "Free to Play" when the game is free', () => {
    const embed = buildGameEmbed(makeGameDetails({ isFreeToPlay: true, price: null }));
    const data = embed.toJSON();
    const priceField = data.fields.find((f) => f.name === 'Price');

    expect(priceField.value).toBe('Free to Play');
  });

  it('displays discounted price with strikethrough when discount is active', () => {
    const details = makeGameDetails({
      isFreeToPlay: false,
      price: {
        currency: 'GBP',
        current: 1999,
        original: 3999,
        discountPercent: 50,
      },
    });
    const embed = buildGameEmbed(details);
    const data = embed.toJSON();
    const priceField = data.fields.find((f) => f.name === 'Price');

    expect(priceField.value).toBe('~~£39.99~~ £19.99 (-50%)');
  });

  it('displays full price when no discount is active', () => {
    const details = makeGameDetails({
      isFreeToPlay: false,
      price: {
        currency: 'GBP',
        current: 4999,
        original: null,
        discountPercent: 0,
      },
    });
    const embed = buildGameEmbed(details);
    const data = embed.toJSON();
    const priceField = data.fields.find((f) => f.name === 'Price');

    expect(priceField.value).toBe('£49.99');
  });

  it('includes metacritic score when non-null', () => {
    const embed = buildGameEmbed(makeGameDetails({ metacriticScore: 92 }));
    const data = embed.toJSON();
    const metacriticField = data.fields.find((f) => f.name === 'Metacritic');

    expect(metacriticField).toBeDefined();
    expect(metacriticField.value).toBe('92');
  });

  it('omits metacritic field when score is null', () => {
    const embed = buildGameEmbed(makeGameDetails({ metacriticScore: null }));
    const data = embed.toJSON();
    const metacriticField = data.fields.find((f) => f.name === 'Metacritic');

    expect(metacriticField).toBeUndefined();
  });
});
