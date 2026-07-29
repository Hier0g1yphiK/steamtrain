/**
 * /watchlist command handler
 * Manages a server-level Steam game watchlist for sale notifications.
 *
 * Subcommands:
 *   add <game>     — Search and add a game to the server watchlist
 *   remove <game>  — Remove a game from the watchlist
 *   list           — Show all watched games
 *   channel <#ch>  — Set the notification channel for sale alerts
 */

import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ComponentType,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { logger } from '../utils/logger.js';
import {
  TimeoutError,
  ApiError,
  GameNotFoundError,
  InvalidInputError,
} from '../utils/errors.js';

const MAX_WATCHLIST_SIZE = 50;

export const command = {
  name: 'watchlist',
  description: 'Manage the server Steam game sale watchlist',
  options: [
    {
      name: 'add',
      description: 'Add a game to the sale watchlist',
      type: 1, // SUB_COMMAND
      options: [
        {
          name: 'game',
          description: 'The name of the Steam game to watch',
          type: 3, // STRING
          required: true,
          min_length: 1,
          max_length: 200,
        },
      ],
    },
    {
      name: 'remove',
      description: 'Remove a game from the sale watchlist',
      type: 1, // SUB_COMMAND
      options: [
        {
          name: 'game',
          description: 'The name of the game to remove',
          type: 3, // STRING
          required: true,
          min_length: 1,
          max_length: 200,
        },
      ],
    },
    {
      name: 'list',
      description: 'Show all games on the sale watchlist',
      type: 1, // SUB_COMMAND
      options: [],
    },
    {
      name: 'channel',
      description: 'Set the channel for sale notifications',
      type: 1, // SUB_COMMAND
      options: [
        {
          name: 'channel',
          description: 'The channel to send sale notifications to',
          type: 7, // CHANNEL
          required: true,
        },
      ],
    },
  ],
};

/**
 * Executes the /watchlist command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} deps
 */
export async function execute(interaction, deps = {}) {
  await interaction.deferReply();

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'add':
      await handleAdd(interaction, deps);
      break;
    case 'remove':
      await handleRemove(interaction, deps);
      break;
    case 'list':
      await handleList(interaction, deps);
      break;
    case 'channel':
      await handleChannel(interaction, deps);
      break;
    default:
      await interaction.editReply({ content: 'Unknown subcommand.' });
  }
}

/**
 * Handle /watchlist add <game>
 */
async function handleAdd(interaction, deps) {
  const { gameSearchService, watchlistStore } = deps;
  const guildId = interaction.guildId;
  const gameName = interaction.options.getString('game').trim();

  // Check watchlist size limit
  const count = watchlistStore.countGuildGames(guildId);
  if (count >= MAX_WATCHLIST_SIZE) {
    await interaction.editReply({
      content: `The watchlist is full (max ${MAX_WATCHLIST_SIZE} games). Remove a game before adding another.`,
    });
    return;
  }

  try {
    const { match, candidates } = await gameSearchService.search(gameName);

    if (match) {
      // Single high-confidence match — add directly
      const added = watchlistStore.addGame(guildId, match.appId, match.name);
      if (added) {
        await interaction.editReply({
          content: `✅ **${match.name}** has been added to the sale watchlist.`,
        });
      } else {
        await interaction.editReply({
          content: `**${match.name}** is already on the watchlist.`,
        });
      }
      return;
    }

    if (candidates.length > 0) {
      // Multiple candidates — show selection menu
      await showAddSelectionMenu(interaction, candidates, watchlistStore, guildId);
      return;
    }

    await interaction.editReply({
      content: `No Steam games found matching "${gameName}". Please check the spelling and try again.`,
    });
  } catch (error) {
    const message = mapErrorToUserMessage(error, gameName);
    await interaction.editReply({ content: message });
    logger.error({ command: 'watchlist add', input: gameName, error });
  }
}

/**
 * Handle /watchlist remove <game>
 */
async function handleRemove(interaction, deps) {
  const { watchlistStore } = deps;
  const guildId = interaction.guildId;
  const gameName = interaction.options.getString('game').trim().toLowerCase();

  const games = watchlistStore.listGames(guildId);

  if (games.length === 0) {
    await interaction.editReply({ content: 'The watchlist is empty.' });
    return;
  }

  // Try exact match first (case-insensitive)
  const exactMatch = games.find((g) => g.name.toLowerCase() === gameName);
  if (exactMatch) {
    watchlistStore.removeGame(guildId, exactMatch.app_id);
    await interaction.editReply({
      content: `✅ **${exactMatch.name}** has been removed from the watchlist.`,
    });
    return;
  }

  // Try partial match
  const partialMatches = games.filter((g) => g.name.toLowerCase().includes(gameName));
  if (partialMatches.length === 1) {
    watchlistStore.removeGame(guildId, partialMatches[0].app_id);
    await interaction.editReply({
      content: `✅ **${partialMatches[0].name}** has been removed from the watchlist.`,
    });
    return;
  }

  if (partialMatches.length > 1) {
    const names = partialMatches.map((g) => `• ${g.name}`).join('\n');
    await interaction.editReply({
      content: `Multiple matches found. Please be more specific:\n${names}`,
    });
    return;
  }

  await interaction.editReply({
    content: `No game matching "${gameName}" found on the watchlist.`,
  });
}

/**
 * Handle /watchlist list
 */
async function handleList(interaction, deps) {
  const { watchlistStore } = deps;
  const guildId = interaction.guildId;

  const games = watchlistStore.listGames(guildId);

  if (games.length === 0) {
    await interaction.editReply({
      content: 'The watchlist is empty. Use `/watchlist add` to add games.',
    });
    return;
  }

  const channelId = watchlistStore.getNotificationChannel(guildId);
  const channelInfo = channelId ? `<#${channelId}>` : 'Not set (use `/watchlist channel`)';

  const embed = new EmbedBuilder()
    .setTitle('🎮 Steam Sale Watchlist')
    .setColor(0x1b2838) // Steam dark blue
    .setDescription(
      games
        .map((g, i) => {
          const priceInfo = g.last_discount_percent > 0
            ? ` — **-${g.last_discount_percent}%**`
            : '';
          return `${i + 1}. [${g.name}](https://store.steampowered.com/app/${g.app_id})${priceInfo}`;
        })
        .join('\n'),
    )
    .addFields({ name: 'Notification Channel', value: channelInfo })
    .setFooter({ text: `${games.length}/${MAX_WATCHLIST_SIZE} games` });

  await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle /watchlist channel <#channel>
 */
async function handleChannel(interaction, deps) {
  const { watchlistStore } = deps;
  const guildId = interaction.guildId;
  const channel = interaction.options.getChannel('channel');

  // Check the user has Manage Guild permission
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply({
      content: 'You need the **Manage Server** permission to set the notification channel.',
    });
    return;
  }

  if (!channel.isTextBased()) {
    await interaction.editReply({
      content: 'Please select a text channel for notifications.',
    });
    return;
  }

  watchlistStore.setNotificationChannel(guildId, channel.id);
  await interaction.editReply({
    content: `✅ Sale notifications will be sent to <#${channel.id}>.`,
  });
}

/**
 * Shows a selection menu for adding a game when multiple candidates are found.
 */
async function showAddSelectionMenu(interaction, candidates, watchlistStore, guildId) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('watchlist_add_select')
    .setPlaceholder('Select a game to add...')
    .addOptions(
      candidates.map((candidate) => ({
        label: candidate.name.slice(0, 100),
        value: JSON.stringify({ appId: candidate.appId, name: candidate.name.slice(0, 80) }),
        description: `Match: ${candidate.similarity}%`,
      })),
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const response = await interaction.editReply({
    content: 'Multiple games found. Select one to add to the watchlist:',
    components: [row],
  });

  try {
    const selection = await response.awaitMessageComponent({
      componentType: ComponentType.StringSelect,
      time: 30_000,
    });

    const { appId, name } = JSON.parse(selection.values[0]);
    const added = watchlistStore.addGame(guildId, appId, name);

    if (added) {
      await selection.update({
        content: `✅ **${name}** has been added to the sale watchlist.`,
        components: [],
      });
    } else {
      await selection.update({
        content: `**${name}** is already on the watchlist.`,
        components: [],
      });
    }
  } catch {
    const disabledMenu = StringSelectMenuBuilder.from(selectMenu).setDisabled(true);
    const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);

    await interaction.editReply({
      content: 'Selection timed out. Please run the command again.',
      components: [disabledRow],
    });
  }
}

/**
 * Maps errors to user-friendly messages for the watchlist command.
 */
function mapErrorToUserMessage(error, searchTerm) {
  if (error instanceof TimeoutError) {
    return `The request timed out while searching for "${searchTerm}". Please try again later.`;
  }
  if (error instanceof GameNotFoundError) {
    return `No game found matching "${searchTerm}". Please check the spelling and try again.`;
  }
  if (error instanceof InvalidInputError) {
    return error.message;
  }
  if (error instanceof ApiError) {
    return 'Steam is temporarily unavailable. Please try again later.';
  }
  return `Something went wrong while searching for "${searchTerm}". Please try again later.`;
}
