/**
 * Command Registry
 *
 * Discovers command modules from src/commands/, validates their exports,
 * registers valid commands with Discord's REST API, and stores handlers
 * in a Map for runtime dispatch.
 */

import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { logger } from './utils/logger.js';

/**
 * Validates that a module exports a valid command interface.
 *
 * A valid module must export:
 * - command.name: string, 1-32 characters
 * - command.description: string, 1-100 characters
 * - command.options: Array
 * - execute: function
 *
 * @param {object} mod - The imported module
 * @param {string} filePath - Path to the module file (for error reporting)
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateCommandModule(mod, filePath) {
  if (!mod || typeof mod !== 'object') {
    return { valid: false, reason: `Module at ${filePath} does not export an object` };
  }

  if (!mod.command || typeof mod.command !== 'object') {
    return { valid: false, reason: `Module at ${filePath} does not export a command object` };
  }

  const { command } = mod;

  if (typeof command.name !== 'string' || command.name.length < 1 || command.name.length > 32) {
    return {
      valid: false,
      reason: `Module at ${filePath} has invalid command.name (must be 1-32 chars, got: ${JSON.stringify(command.name)})`,
    };
  }

  if (
    typeof command.description !== 'string' ||
    command.description.length < 1 ||
    command.description.length > 100
  ) {
    return {
      valid: false,
      reason: `Module at ${filePath} has invalid command.description (must be 1-100 chars, got length: ${typeof command.description === 'string' ? command.description.length : typeof command.description})`,
    };
  }

  if (!Array.isArray(command.options)) {
    return {
      valid: false,
      reason: `Module at ${filePath} has invalid command.options (must be an array)`,
    };
  }

  if (typeof mod.execute !== 'function') {
    return { valid: false, reason: `Module at ${filePath} does not export an execute function` };
  }

  return { valid: true };
}

/**
 * Loads and validates all command modules from the specified directory.
 *
 * @param {string} commandsDir - Absolute path to the commands directory
 * @returns {Promise<Array<{ command: object, execute: function, filePath: string }>>}
 */
export async function loadCommands(commandsDir) {
  const resolvedDir = resolve(commandsDir);
  let files;

  try {
    files = await readdir(resolvedDir);
  } catch (error) {
    logger.error({
      command: 'registry',
      input: resolvedDir,
      error,
    });
    return [];
  }

  const jsFiles = files.filter(
    (file) => file.endsWith('.js') && !file.endsWith('.test.js') && !file.endsWith('.property.test.js'),
  );

  const handlers = new Map();
  const validCommands = [];

  for (const file of jsFiles) {
    const filePath = join(resolvedDir, file);
    let mod;

    try {
      const fileUrl = pathToFileURL(filePath).href;
      mod = await import(fileUrl);
    } catch (error) {
      logger.error({
        command: 'registry',
        input: filePath,
        error,
      });
      continue;
    }

    const validation = validateCommandModule(mod, filePath);

    if (!validation.valid) {
      logger.error({
        command: 'registry',
        input: filePath,
        error: new Error(validation.reason),
      });
      continue;
    }

    const { command, execute } = mod;

    // Detect duplicate command names — keep first, log error for duplicates
    if (handlers.has(command.name)) {
      logger.error({
        command: 'registry',
        input: filePath,
        error: new Error(
          `Duplicate command name "${command.name}" in ${filePath}. Keeping first-loaded module.`,
        ),
      });
      continue;
    }

    handlers.set(command.name, execute);
    validCommands.push({ command, execute, filePath });
  }

  return validCommands;
}

/**
 * Registers commands with Discord's REST API.
 *
 * @param {Array<{ command: object }>} commands - Array of validated command objects
 * @param {object} options
 * @param {string} options.token - Discord bot token
 * @param {string} options.applicationId - Discord application ID
 * @returns {Promise<void>}
 */
export async function registerCommands(commands, { token, applicationId }) {
  const rest = new REST({ version: '10' }).setToken(token);

  const commandData = commands.map(({ command }) => ({
    name: command.name,
    description: command.description,
    options: command.options,
  }));

  await rest.put(Routes.applicationCommands(applicationId), { body: commandData });

  logger.info({
    message: `Registered ${commandData.length} command(s) with Discord API`,
    commands: commandData.map((c) => c.name),
  });
}

/**
 * Builds a handler map from validated commands for runtime dispatch.
 *
 * @param {Array<{ command: object, execute: function }>} commands
 * @returns {Map<string, function>}
 */
export function buildHandlerMap(commands) {
  const map = new Map();
  for (const { command, execute } of commands) {
    map.set(command.name, execute);
  }
  return map;
}
