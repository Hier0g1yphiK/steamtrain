/**
 * Unit tests for /game command handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { command, execute, validateGameName, mapErrorToUserMessage } from './steamgame.js';
import {
  TimeoutError,
  ApiError,
  GameNotFoundError,
  RegionUnavailableError,
  InvalidInputError,
} from '../utils/errors.js';

// Mock discord.js components
vi.mock('discord.js', () => ({
  ActionRowBuilder: class {
    constructor() {
      this.components = [];
    }
    addComponents(...components) {
      this.components.push(...components);
      return this;
    }
  },
  StringSelectMenuBuilder: class {
    constructor() {
      this._customId = '';
      this._placeholder = '';
      this._options = [];
      this._disabled = false;
    }
    setCustomId(id) { this._customId = id; return this; }
    setPlaceholder(text) { this._placeholder = text; return this; }
    setDisabled(disabled) { this._disabled = disabled; return this; }
    addOptions(options) { this._options = options; return this; }
    static from(menu) {
      const copy = new this();
      copy._customId = menu._customId;
      copy._placeholder = menu._placeholder;
      copy._options = menu._options;
      return copy;
    }
  },
  ComponentType: { StringSelect: 3 },
}));

vi.mock('../embeds/gameEmbed.js', () => ({
  buildGameEmbed: vi.fn((details) => ({ type: 'embed', data: details })),
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

function createMockInteraction(nameValue) {
  const response = {
    awaitMessageComponent: vi.fn(),
  };

  return {
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(response),
    options: {
      getString: vi.fn().mockReturnValue(nameValue),
      data: [{ name: 'name', value: nameValue }],
    },
    commandName: 'game',
    _response: response,
  };
}

describe('game command definition', () => {
  it('has the correct name', () => {
    expect(command.name).toBe('steamgame');
  });

  it('has a description within 1-100 chars', () => {
    expect(command.description.length).toBeGreaterThanOrEqual(1);
    expect(command.description.length).toBeLessThanOrEqual(100);
  });

  it('has a required "name" string option', () => {
    const nameOption = command.options.find((o) => o.name === 'name');
    expect(nameOption).toBeDefined();
    expect(nameOption.type).toBe(3); // STRING
    expect(nameOption.required).toBe(true);
  });
});

describe('validateGameName', () => {
  it('accepts a valid name', () => {
    const result = validateGameName('Portal 2');
    expect(result.valid).toBe(true);
    expect(result.trimmed).toBe('Portal 2');
  });

  it('trims whitespace', () => {
    const result = validateGameName('  Half-Life  ');
    expect(result.valid).toBe(true);
    expect(result.trimmed).toBe('Half-Life');
  });

  it('rejects empty string', () => {
    const result = validateGameName('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot be empty');
  });

  it('rejects whitespace-only string', () => {
    const result = validateGameName('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cannot be empty');
  });

  it('rejects name longer than 200 chars', () => {
    const result = validateGameName('a'.repeat(201));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too long');
  });

  it('accepts exactly 200 chars', () => {
    const result = validateGameName('a'.repeat(200));
    expect(result.valid).toBe(true);
  });

  it('accepts exactly 1 char', () => {
    const result = validateGameName('x');
    expect(result.valid).toBe(true);
  });

  it('rejects non-string input', () => {
    const result = validateGameName(null);
    expect(result.valid).toBe(false);
  });
});

describe('mapErrorToUserMessage', () => {
  it('maps TimeoutError', () => {
    const msg = mapErrorToUserMessage(new TimeoutError(), 'Portal');
    expect(msg).toContain('timed out');
    expect(msg).toContain('Portal');
  });

  it('maps RegionUnavailableError', () => {
    const msg = mapErrorToUserMessage(new RegionUnavailableError(), 'Portal');
    expect(msg).toContain('not available in the selected region');
  });

  it('maps GameNotFoundError', () => {
    const msg = mapErrorToUserMessage(new GameNotFoundError(), 'Portal');
    expect(msg).toContain('No game found');
    expect(msg).toContain('Portal');
  });

  it('maps ApiError', () => {
    const msg = mapErrorToUserMessage(new ApiError('fail', 500), 'Portal');
    expect(msg).toContain('temporarily unavailable');
  });

  it('maps unknown errors', () => {
    const msg = mapErrorToUserMessage(new Error('oops'), 'Portal');
    expect(msg).toContain('Something went wrong');
    expect(msg).toContain('Portal');
  });
});

describe('execute', () => {
  let interaction;
  let mockSearchService;
  let mockDetailsService;

  beforeEach(() => {
    interaction = createMockInteraction('Portal 2');
    mockSearchService = {
      search: vi.fn(),
    };
    mockDetailsService = {
      getDetails: vi.fn(),
    };
  });

  it('calls deferReply before any service calls', async () => {
    mockSearchService.search.mockResolvedValue({ match: null, candidates: [] });

    await execute(interaction, {
      gameSearchService: mockSearchService,
      gameDetailsService: mockDetailsService,
    });

    expect(interaction.deferReply).toHaveBeenCalled();
    // deferReply should have been called before search
    const deferOrder = interaction.deferReply.mock.invocationCallOrder[0];
    const searchOrder = mockSearchService.search.mock.invocationCallOrder[0];
    expect(deferOrder).toBeLessThan(searchOrder);
  });

  it('shows embed for single match', async () => {
    const matchResult = { appId: 620, name: 'Portal 2', similarity: 95 };
    const gameDetails = { appId: 620, name: 'Portal 2', storeUrl: 'https://store.steampowered.com/app/620' };

    mockSearchService.search.mockResolvedValue({ match: matchResult, candidates: [] });
    mockDetailsService.getDetails.mockResolvedValue(gameDetails);

    await execute(interaction, {
      gameSearchService: mockSearchService,
      gameDetailsService: mockDetailsService,
    });

    expect(mockDetailsService.getDetails).toHaveBeenCalledWith(620);
    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    );
  });

  it('shows no results message when no matches', async () => {
    mockSearchService.search.mockResolvedValue({ match: null, candidates: [] });

    await execute(interaction, {
      gameSearchService: mockSearchService,
      gameDetailsService: mockDetailsService,
    });

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('No results found'),
      }),
    );
  });

  it('includes search term in no results message', async () => {
    mockSearchService.search.mockResolvedValue({ match: null, candidates: [] });

    await execute(interaction, {
      gameSearchService: mockSearchService,
      gameDetailsService: mockDetailsService,
    });

    const call = interaction.editReply.mock.calls[0][0];
    expect(call.content).toContain('Portal 2');
  });

  it('shows selection menu for multiple candidates', async () => {
    const candidates = [
      { appId: 620, name: 'Portal 2', similarity: 85 },
      { appId: 400, name: 'Portal', similarity: 75 },
    ];
    mockSearchService.search.mockResolvedValue({ match: null, candidates });

    // The awaitMessageComponent will reject (simulate timeout)
    interaction._response.awaitMessageComponent = vi.fn().mockRejectedValue(new Error('timeout'));

    await execute(interaction, {
      gameSearchService: mockSearchService,
      gameDetailsService: mockDetailsService,
    });

    // First editReply shows the select menu
    const firstCall = interaction.editReply.mock.calls[0][0];
    expect(firstCall.content).toContain('Multiple games found');
    expect(firstCall.components).toBeDefined();
  });

  it('shows validation error for empty name', async () => {
    interaction = createMockInteraction('   ');

    await execute(interaction, {
      gameSearchService: mockSearchService,
      gameDetailsService: mockDetailsService,
    });

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('cannot be empty'),
      }),
    );
    expect(mockSearchService.search).not.toHaveBeenCalled();
  });

  it('maps service errors to user-friendly messages', async () => {
    mockSearchService.search.mockRejectedValue(new TimeoutError('timed out'));

    await execute(interaction, {
      gameSearchService: mockSearchService,
      gameDetailsService: mockDetailsService,
    });

    const call = interaction.editReply.mock.calls[0][0];
    expect(call.content).toContain('timed out');
  });

  it('logs errors with command context', async () => {
    const { logger } = await import('../utils/logger.js');
    mockSearchService.search.mockRejectedValue(new ApiError('Steam down', 503));

    await execute(interaction, {
      gameSearchService: mockSearchService,
      gameDetailsService: mockDetailsService,
    });

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'steamgame',
        input: 'Portal 2',
      }),
    );
  });
});
