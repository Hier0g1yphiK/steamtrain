/**
 * Steam Link Listener
 * Detects Steam store links in messages and replies with a rich game embed.
 * Optionally suppresses the default Discord link preview.
 */

import { buildGameEmbed } from '../embeds/gameEmbed.js';
import { logger } from '../utils/logger.js';

/**
 * Regex to match Steam store app URLs and extract the app ID.
 * Matches: https://store.steampowered.com/app/730/...
 */
const STEAM_STORE_LINK_REGEX =
  /https?:\/\/store\.steampowered\.com\/app\/(\d+)\/?[^\s]*/gi;

/**
 * Extracts unique Steam app IDs from a message string.
 * @param {string} content - Message content
 * @returns {number[]} Array of unique app IDs found
 */
export function extractAppIds(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const matches = [...content.matchAll(STEAM_STORE_LINK_REGEX)];
  const ids = matches.map((match) => Number(match[1]));

  // Deduplicate
  return [...new Set(ids)];
}

/**
 * Registers the Steam link listener on the given Discord client.
 *
 * @param {import('discord.js').Client} client - The Discord client
 * @param {object} options
 * @param {import('../services/gameDetails.js').GameDetailsService} options.gameDetailsService
 */
export function registerSteamLinkListener(client, { gameDetailsService }) {
  client.on('messageCreate', async (message) => {
    // Ignore bot messages to prevent loops
    if (message.author.bot) return;

    const appIds = extractAppIds(message.content);
    if (appIds.length === 0) return;

    // Limit to first 3 links per message to avoid spam
    const idsToProcess = appIds.slice(0, 3);

    // Suppress the default link preview first, before sending our embed
    try {
      await message.suppressEmbeds(true);
    } catch {
      // Missing Manage Messages permission — continue without suppressing
      logger.warn({
        event: 'steam_link_listener',
        message: 'Failed to suppress embeds — bot may lack Manage Messages permission',
      });
    }

    for (const appId of idsToProcess) {
      try {
        const details = await gameDetailsService.getDetails(appId);
        const embed = buildGameEmbed(details);

        await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
      } catch (error) {
        logger.warn({
          event: 'steam_link_listener',
          appId,
          error: error.message,
        });
        // Don't reply with an error — the link is still visible, just no embed
      }
    }
  });
}
