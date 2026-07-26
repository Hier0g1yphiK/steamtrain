/**
 * /steamuser command handler
 *
 * Looks up a Steam user profile by profile URL, vanity name, or SteamID64.
 * Resolves the input to a SteamID64, fetches the profile, and displays
 * the result as a Discord embed.
 */

import { UserResolveService } from '../services/userResolve.js';
import { UserProfileService } from '../services/userProfile.js';
import { buildUserEmbed } from '../embeds/userEmbed.js';
import { logger } from '../utils/logger.js';
import { UserNotFoundError, InvalidInputError, TimeoutError } from '../utils/errors.js';

export const command = {
  name: 'steamuser',
  description: 'Look up a Steam profile by profile URL, vanity name, or SteamID64',
  options: [
    {
      name: 'query',
      description: 'Steam profile URL, vanity name, or 17-digit SteamID64',
      type: 3, // STRING
      required: true,
    },
  ],
};

/**
 * Maps a caught error to a user-friendly message string.
 *
 * @param {Error} error
 * @returns {string}
 */
function mapErrorToUserMessage(error) {
  if (error instanceof UserNotFoundError) {
    return 'Could not find that Steam user. Please check the spelling or try a profile URL.';
  }
  if (error instanceof InvalidInputError) {
    return 'Invalid input. Accepted formats: profile URL, vanity name, or 17-digit SteamID64.';
  }
  if (error instanceof TimeoutError) {
    return 'The request timed out. Please try again.';
  }
  return 'Something went wrong. Please try again later.';
}

/**
 * Executes the /steamuser command.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} deps - Injected dependencies
 * @param {UserResolveService} deps.userResolveService
 * @param {UserProfileService} deps.userProfileService
 */
export async function execute(interaction, deps = {}) {
  await interaction.deferReply();

  const query = interaction.options.getString('query');

  try {
    const { userResolveService, userProfileService } = deps;

    const { steamId64 } = await userResolveService.resolve(query);
    const profile = await userProfileService.getProfile(steamId64);
    const embed = buildUserEmbed(profile);

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const message = mapErrorToUserMessage(error);
    await interaction.editReply({ content: message });

    logger.error({
      command: interaction.commandName,
      input: interaction.options.data,
      error,
    });
  }
}
