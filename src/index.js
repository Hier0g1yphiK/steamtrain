/**
 * Entry point: load environment, wire all layers together, and start the bot.
 *
 * Wiring order: config → cache → clients → services → commands → registry → bot
 */

import { config } from './utils/config.js';
import {
  getAppListCache,
  getGameDetailCache,
  getUserProfileCache,
  getIgdbCache,
} from './cache/cacheManager.js';
import { SteamClient } from './api/steamClient.js';
import { IgdbClient } from './api/igdbClient.js';
import { GameSearchService } from './services/gameSearch.js';
import { GameDetailsService } from './services/gameDetails.js';
import { IgdbGameSearchService } from './services/igdbGameSearch.js';
import { IgdbGameDetailsService } from './services/igdbGameDetails.js';
import { UserResolveService } from './services/userResolve.js';
import { UserProfileService } from './services/userProfile.js';
import { loadCommands, registerCommands, buildHandlerMap } from './registry.js';
import { createBot } from './bot.js';
import { logger } from './utils/logger.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Cache layer ---
const cache = {
  appListCache: getAppListCache(),
  gameDetailCache: getGameDetailCache(),
  userProfileCache: getUserProfileCache(),
  igdbCache: getIgdbCache(),
};

// --- API clients ---
const steamClient = new SteamClient(config.steamApiKey, cache);
const igdbClient = new IgdbClient({
  clientId: config.twitchClientId,
  clientSecret: config.twitchClientSecret,
  cache,
});

// --- Service layer ---
const gameSearchService = new GameSearchService(steamClient);
const gameDetailsService = new GameDetailsService(steamClient);
const igdbGameSearchService = new IgdbGameSearchService(igdbClient);
const igdbGameDetailsService = new IgdbGameDetailsService(igdbClient);
const userResolveService = new UserResolveService(steamClient);
const userProfileService = new UserProfileService(steamClient);

const services = {
  gameSearchService,
  gameDetailsService,
  igdbGameSearchService,
  igdbGameDetailsService,
  userResolveService,
  userProfileService,
};

// --- Command discovery and registration ---
const commandsDir = join(__dirname, 'commands');
const commands = await loadCommands(commandsDir);

await registerCommands(commands, {
  token: config.discordToken,
  applicationId: config.discordApplicationId,
});

// --- Handler map ---
const handlerMap = buildHandlerMap(commands);

// --- Bot creation and login ---
const client = createBot({ handlerMap, services });

client.once('ready', () => {
  logger.info({ message: `Bot logged in as ${client.user.tag}` });
});

await client.login(config.discordToken);
