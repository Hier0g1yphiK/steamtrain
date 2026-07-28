/**
 * /steamgame command handler
 * Searches for a Steam game by name and displays details as a rich embed.
 */

import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
} from 'discord.js';
import { GameSearchService } from '../services/gameSearch.js';
import { GameDetailsService } from '../services/gameDetails.js';
import { buildGameEmbed } from '../embeds/gameEmbed.js';
import { logger } from '../utils/logger.js';
import {
  TimeoutError,
  ApiError,
  GameNotFoundError,
  RegionUnavailableError,
  InvalidInputError,
} from '../utils/errors.js';

export const command = {
  name: 'steamgame',
  description: 'Look up a Steam game by name via the Steam store',
  options: [
    {
      name: 'name',
      description: 'The name of the game to search for',
      type: 3, // STRING type
      required: true,
      min_length: 1,
      max_length: 200,
    },
  ],
};

/**
 * Validates the game name input.
 * @param {string} name - Raw user input
 * @returns {{ valid: boolean, trimmed: string, error?: string }}
 */
export function validateGameName(name) {
  if (typeof name !== 'string') {
    return { valid: false, trimmed: '', error: 'Game name must be a string.' };
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      trimmed,
      error: 'Game name cannot be empty. Please provide a name between 1 and 200 characters.',
    };
  }

  if (trimmed.length > 200) {
    return {
      valid: false,
      trimmed,
      error: 'Game name is too long. Please provide a name between 1 and 200 characters.',
    };
  }

  return { valid: true, trimmed };
}

/**
 * Maps a service error to a user-friendly message.
 * @param {Error} error - The caught error
 * @param {string} searchTerm - The user's original search term
 * @returns {string} User-facing error message
 */
export function mapErrorToUserMessage(error, searchTerm) {
  if (error instanceof TimeoutError) {
    return `The request timed out while searching for "${searchTerm}". Please try again later.`;
  }

  if (error instanceof RegionUnavailableError) {
    return `The game is not available in the selected region. Please try a different game.`;
  }

  if (error instanceof GameNotFoundError) {
    return `No game found matching "${searchTerm}". Please check the spelling and try again.`;
  }

  if (error instanceof InvalidInputError) {
    return error.message;
  }

  if (error instanceof ApiError) {
    return `Steam is temporarily unavailable. Please try again later.`;
  }

  return `Something went wrong while searching for "${searchTerm}". Please try again later.`;
}

/**
 * Executes the /game command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {{ gameSearchService: GameSearchService, gameDetailsService: GameDetailsService }} deps
 */
export async function execute(interaction, deps = {}) {
  await interaction.deferReply();

  const rawName = interaction.options.getString('name');
  const validation = validateGameName(rawName);

  if (!validation.valid) {
    await interaction.editReply({ content: validation.error });
    return;
  }

  const searchTerm = validation.trimmed;

  // Allow dependency injection for testing, fall back to creating services
  const gameSearchService = deps.gameSearchService;
  const gameDetailsService = deps.gameDetailsService;

  try {
    const { match, candidates } = await gameSearchService.search(searchTerm);

    if (match) {
      // Single high-confidence match — fetch details and show embed
      const details = await gameDetailsService.getDetails(match.appId);
      const embed = buildGameEmbed(details);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (candidates.length > 0) {
      // Multiple candidates — show selection menu
      await showSelectionMenu(interaction, candidates, gameDetailsService);
      return;
    }

    // No matches found
    await interaction.editReply({
      content: `No results found for "${searchTerm}". Please check the spelling and try again.`,
    });
  } catch (error) {
    const message = mapErrorToUserMessage(error, searchTerm);
    await interaction.editReply({ content: message });
    logger.error({
      command: 'steamgame',
      input: searchTerm,
      error,
    });
  }
}

/**
 * Shows an interactive selection menu for multiple game candidates.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {Array<{ appId: number, name: string, similarity: number }>} candidates
 * @param {GameDetailsService} gameDetailsService
 */
async function showSelectionMenu(interaction, candidates, gameDetailsService) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('game_select')
    .setPlaceholder('Select a game...')
    .addOptions(
      candidates.map((candidate) => ({
        label: candidate.name.slice(0, 100), // Discord label max 100 chars
        value: String(candidate.appId),
        description: `Match: ${candidate.similarity}%`,
      })),
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const response = await interaction.editReply({
    content: 'Multiple games found. Please select one:',
    components: [row],
  });

  try {
    const selection = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      time: 30_000,
    });

    const selectedAppId = selection.values[0];
    const details = await gameDetailsService.getDetails(Number(selectedAppId));
    const embed = buildGameEmbed(details);

    await selection.update({
      content: '',
      embeds: [embed],
      components: [],
    });
  } catch (error) {
    // Timeout or other component interaction failure
    const disabledMenu = StringSelectMenuBuilder.from(selectMenu).setDisabled(true);
    const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);

    await interaction.editReply({
      content: 'Selection timed out. Please run the command again to search.',
      components: [disabledRow],
    });
  }
}
