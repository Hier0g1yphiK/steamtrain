/**
 * Bot setup: Discord client creation with required intents,
 * interactionCreate event handler, and top-level error boundary.
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { registerSteamLinkListener } from './listeners/steamLink.js';
import { logger } from './utils/logger.js';

/**
 * Creates a configured Discord client with interaction handling.
 *
 * @param {object} options
 * @param {Map<string, function>} options.handlerMap - Command name → execute function map
 * @param {object} options.services - Injected service dependencies for command handlers
 * @returns {Client} Configured Discord.js client
 */
export function createBot({ handlerMap, services }) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const handler = handlerMap.get(interaction.commandName);

    if (!handler) {
      logger.warn({
        message: `No handler found for command: ${interaction.commandName}`,
        command: interaction.commandName,
      });
      return;
    }

    try {
      await handler(interaction, services);
    } catch (error) {
      logger.error({
        command: interaction.commandName,
        input: interaction.options?.data,
        error,
      });

      const errorMessage = 'Something went wrong. Please try again later.';

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: errorMessage });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      } catch (replyError) {
        logger.error({
          command: interaction.commandName,
          input: interaction.options?.data,
          error: replyError,
        });
      }
    }
  });

  // Register the Steam link listener for auto-embed on store links
  registerSteamLinkListener(client, services);

  return client;
}
