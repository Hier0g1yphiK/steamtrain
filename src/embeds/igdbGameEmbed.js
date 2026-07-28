/**
 * IGDB Game Embed Builder
 * Transforms an IGDB GameDetails object into a Discord EmbedBuilder instance.
 */

import { EmbedBuilder } from 'discord.js';

/**
 * Builds a Discord embed for IGDB game details.
 * @param {object} details - Normalized IGDB game details
 * @returns {EmbedBuilder} A configured Discord embed
 */
export function buildIgdbGameEmbed(details) {
  const embed = new EmbedBuilder()
    .setTitle(details.name)
    .setURL(details.igdbUrl)
    .setDescription(details.summary || 'No description available.')
    .setColor(0x9147FF); // IGDB/Twitch purple

  if (details.coverUrl) {
    embed.setThumbnail(details.coverUrl);
  }

  const fields = [];

  if (details.genres.length > 0) {
    fields.push({ name: 'Genres', value: details.genres.join(', '), inline: true });
  }

  if (details.platforms.length > 0) {
    fields.push({
      name: 'Platforms',
      value: truncateField(details.platforms.join(', '), 1024),
      inline: true,
    });
  }

  if (details.developers.length > 0) {
    fields.push({ name: 'Developers', value: details.developers.join(', '), inline: true });
  }

  if (details.publishers.length > 0) {
    fields.push({ name: 'Publishers', value: details.publishers.join(', '), inline: true });
  }

  if (details.releaseDate) {
    fields.push({ name: 'Release Date', value: details.releaseDate, inline: true });
  }

  if (details.rating != null) {
    const ratingStr = `${details.rating}/100 (${details.ratingCount} ratings)`;
    fields.push({ name: 'Rating', value: ratingStr, inline: true });
  }

  if (details.criticRating != null) {
    const criticStr = `${details.criticRating}/100 (${details.criticRatingCount} reviews)`;
    fields.push({ name: 'Critic Score', value: criticStr, inline: true });
  }

  if (details.gameModes.length > 0) {
    fields.push({ name: 'Game Modes', value: details.gameModes.join(', '), inline: true });
  }

  // Store links
  const storeLinksStr = formatStoreLinks(details.storeLinks);
  if (storeLinksStr) {
    fields.push({ name: 'Store Links', value: storeLinksStr, inline: false });
  }

  embed.addFields(fields);

  embed.setFooter({ text: 'Powered by IGDB' });

  return embed;
}

/**
 * Formats store links as a markdown string.
 * @param {object} storeLinks - Object with store name keys and URL values
 * @returns {string} Formatted store links or empty string
 */
function formatStoreLinks(storeLinks) {
  const parts = [];

  if (storeLinks.steam) {
    parts.push(`[Steam](${storeLinks.steam})`);
  }
  if (storeLinks.epic) {
    parts.push(`[Epic Games](${storeLinks.epic})`);
  }
  if (storeLinks.gog) {
    parts.push(`[GOG](${storeLinks.gog})`);
  }
  if (storeLinks.official) {
    parts.push(`[Official Site](${storeLinks.official})`);
  }

  return parts.join(' • ');
}

/**
 * Truncates a field value to Discord's max field length.
 */
function truncateField(str, maxLength) {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}
