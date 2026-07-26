/**
 * Game Details Service
 * Fetches detailed game information from Steam's appdetails API
 * and maps it to the GameDetails data model.
 */

import { RegionUnavailableError } from '../utils/errors.js';

const FILTERS = [
  'price_overview',
  'short_description',
  'header_image',
  'genres',
  'release_date',
  'developers',
  'publishers',
  'metacritic',
];

const REGION_CODE = 'gb';

export class GameDetailsService {
  /**
   * @param {import('../api/steamClient.js').SteamClient} steamClient
   */
  constructor(steamClient) {
    this.steamClient = steamClient;
  }

  /**
   * Fetch game details for a given app ID and return a GameDetails object.
   * @param {number|string} appId - Steam app ID
   * @returns {Promise<object>} GameDetails data model
   * @throws {RegionUnavailableError} If the game is not available in the selected region
   */
  async getDetails(appId) {
    const result = await this.steamClient.getAppDetails(appId, REGION_CODE, FILTERS);

    const appData = result[String(appId)];

    if (!appData || appData.success === false) {
      throw new RegionUnavailableError(
        `Game ${appId} is not available in the selected region`
      );
    }

    const data = appData.data;

    return mapToGameDetails(appId, data);
  }
}

/**
 * Maps the raw Steam API response data to the GameDetails data model.
 */
function mapToGameDetails(appId, data) {
  const isFreeToPlay = data.is_free === true;

  return {
    appId: Number(appId),
    name: data.name || '',
    shortDescription: truncate(data.short_description || '', 300),
    headerImage: data.header_image || '',
    genres: (data.genres || []).map((g) => g.description),
    developers: data.developers || [],
    publishers: data.publishers || [],
    releaseDate: data.release_date?.date || '',
    isFreeToPlay,
    price: mapPrice(data, isFreeToPlay),
    metacriticScore: data.metacritic?.score ?? null,
    storeUrl: `https://store.steampowered.com/app/${appId}`,
  };
}

/**
 * Maps price data from the API response.
 * Returns null if the game is free-to-play.
 */
function mapPrice(data, isFreeToPlay) {
  if (isFreeToPlay) {
    return null;
  }

  const priceOverview = data.price_overview;
  if (!priceOverview) {
    return null;
  }

  return {
    currency: 'GBP',
    current: priceOverview.final,
    original: priceOverview.discount_percent > 0 ? priceOverview.initial : null,
    discountPercent: priceOverview.discount_percent || 0,
  };
}

/**
 * Truncates a string to the specified max length.
 */
function truncate(str, maxLength) {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength);
}
