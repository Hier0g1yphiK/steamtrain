/**
 * Unit tests for src/bot.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBot } from './bot.js';

// Mock discord.js Client
vi.mock('discord.js', () => {
  const listeners = {};
  const mockClient = {
    on: vi.fn((event, handler) => {
      listeners[event] = handler;
    }),
    once: vi.fn(),
    login: vi.fn().mockResolvedValue('token'),
    user: { tag: 'TestBot#1234' },
  };
  return {
    Client: vi.fn(() => mockClient),
    GatewayIntentBits: { Guilds: 1 },
    __mockClient: mockClient,
    __listeners: listeners,
  };
});

function createMockInteraction(commandName, { deferred = false, replied = false } = {}) {
  return {
    isChatInputCommand: () => true,
    commandName,
    deferred,
    replied,
    options: { data: [{ name: 'test', value: 'value' }] },
    reply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
  };
}

describe('createBot', () => {
  let listeners;
  let client;
  let handlerMap;
  let services;

  beforeEach(async () => {
    vi.clearAllMocks();
    const discordMock = await import('discord.js');
    listeners = discordMock.__listeners;

    handlerMap = new Map();
    services = { gameSearchService: {}, gameDetailsService: {} };
    client = createBot({ handlerMap, services });
  });

  it('creates a client with required intents', async () => {
    const { Client, GatewayIntentBits } = await import('discord.js');
    expect(Client).toHaveBeenCalledWith({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
  });

  it('registers an interactionCreate event listener', async () => {
    const { __mockClient } = await import('discord.js');
    expect(__mockClient.on).toHaveBeenCalledWith('interactionCreate', expect.any(Function));
  });

  it('ignores non-chat-input interactions', async () => {
    const handler = vi.fn();
    handlerMap.set('game', handler);

    const interaction = {
      isChatInputCommand: () => false,
      commandName: 'game',
    };

    await listeners.interactionCreate(interaction);
    expect(handler).not.toHaveBeenCalled();
  });

  it('dispatches to the correct command handler', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    handlerMap.set('game', handler);

    const interaction = createMockInteraction('game');
    await listeners.interactionCreate(interaction);

    expect(handler).toHaveBeenCalledWith(interaction, services);
  });

  it('does nothing when no handler is found for a command', async () => {
    const interaction = createMockInteraction('unknown');
    // Should not throw
    await listeners.interactionCreate(interaction);
  });

  it('catches handler errors and edits reply if already deferred', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    handlerMap.set('game', handler);

    const interaction = createMockInteraction('game', { deferred: true });
    await listeners.interactionCreate(interaction);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content: 'Something went wrong. Please try again later.',
    });
  });

  it('catches handler errors and replies ephemeral if not deferred', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    handlerMap.set('game', handler);

    const interaction = createMockInteraction('game', { deferred: false, replied: false });
    await listeners.interactionCreate(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Something went wrong. Please try again later.',
      ephemeral: true,
    });
  });

  it('handles errors in the error reply gracefully', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('boom'));
    handlerMap.set('game', handler);

    const interaction = createMockInteraction('game', { deferred: true });
    interaction.editReply.mockRejectedValue(new Error('reply failed'));

    // Should not throw
    await listeners.interactionCreate(interaction);
  });
});

// Helper removed — using direct import instead
