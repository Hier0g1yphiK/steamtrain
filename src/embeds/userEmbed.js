/**
 * User Embed Builder
 *
 * Transforms a UserProfile data model into a Discord EmbedBuilder
 * for displaying Steam user profile information.
 */

import { EmbedBuilder } from 'discord.js';

/**
 * Builds a Discord embed from a UserProfile object.
 *
 * Always includes: persona name as title, avatar as thumbnail,
 * profile URL as link, online status, and visibility.
 *
 * Conditionally includes country and game count only if the profile
 * is public and the values are non-null.
 *
 * @param {object} userProfile - The UserProfile data model
 * @param {string} userProfile.steamId64
 * @param {string} userProfile.personaName
 * @param {string} userProfile.avatarUrl
 * @param {string} userProfile.profileUrl
 * @param {string} userProfile.onlineStatus
 * @param {string} userProfile.visibility - 'Public' or 'Private'
 * @param {string|null} userProfile.country - ISO country code or null
 * @param {number|null} userProfile.gameCount - Number of games or null
 * @returns {EmbedBuilder}
 */
export function buildUserEmbed(userProfile) {
  const embed = new EmbedBuilder()
    .setTitle(userProfile.personaName)
    .setURL(userProfile.profileUrl)
    .setThumbnail(userProfile.avatarUrl)
    .addFields(
      { name: 'Status', value: userProfile.onlineStatus, inline: true },
      { name: 'Visibility', value: userProfile.visibility, inline: true },
    );

  if (userProfile.visibility === 'Public' && userProfile.country != null) {
    embed.addFields({ name: 'Country', value: userProfile.country, inline: true });
  }

  if (userProfile.visibility === 'Public' && userProfile.gameCount != null) {
    embed.addFields({ name: 'Games Owned', value: String(userProfile.gameCount), inline: true });
  }

  return embed;
}
