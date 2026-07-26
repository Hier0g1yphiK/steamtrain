/**
 * Game Embed Builder
 * Transforms a GameDetails object into a Discord EmbedBuilder instance.
 */

import { EmbedBuilder } from 'discord.js';

/**
 * Formats a price in pence to a GBP string with £ symbol and two decimal places.
 * @param {number} pence - Price in pence
 * @returns {string} Formatted price string (e.g. "£19.99")
 */
function formatPrice(pence) {
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * Builds the price display string based on free-to-play, discount, or full price rules.
 * @param {object} gameDetails - The GameDetails data model
 * @returns {string} Formatted price string
 */
function formatPriceField(gameDetails) {
  if (gameDetails.isFreeToPlay) {
    return 'Free to Play';
  }

  if (!gameDetails.price) {
    return 'Free to Play';
  }

  const { current, original, discountPercent } = gameDetails.price;

  if (discountPercent > 0 && original != null) {
    return `~~${formatPrice(original)}~~ ${formatPrice(current)} (-${discountPercent}%)`;
  }

  return formatPrice(current);
}

/**
 * Builds a Discord embed for a game details response.
 * @param {object} gameDetails - The GameDetails data model
 * @returns {EmbedBuilder} A configured Discord embed
 */
export function buildGameEmbed(gameDetails) {
  const embed = new EmbedBuilder()
    .setTitle(gameDetails.name)
    .setURL(gameDetails.storeUrl)
    .setImage(gameDetails.headerImage)
    .setDescription(gameDetails.shortDescription)
    .addFields(
      { name: 'Genres', value: gameDetails.genres.join(', ') || 'N/A', inline: true },
      { name: 'Developers', value: gameDetails.developers.join(', ') || 'N/A', inline: true },
      { name: 'Publishers', value: gameDetails.publishers.join(', ') || 'N/A', inline: true },
      { name: 'Release Date', value: gameDetails.releaseDate || 'TBA', inline: true },
      { name: 'Price', value: formatPriceField(gameDetails), inline: true },
    );

  if (gameDetails.metacriticScore != null) {
    embed.addFields({ name: 'Metacritic', value: String(gameDetails.metacriticScore), inline: true });
  }

  return embed;
}
