/**
 * Unit tests for the Steam Link Listener.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractAppIds, registerSteamLinkListener } from './steamLink.js';

describe('extractAppIds', () => {
  it('extracts a single app ID from a store link', () => {
    const content = 'Check out https://store.steampowered.com/app/730/CounterStrike_2/';
    expect(extractAppIds(content)).toEqual([730]);
  });

  it('extracts multiple unique app IDs', () => {
    const content =
      'Games: https://store.steampowered.com/app/570/Dota_2/ and https://store.steampowered.com/app/730/CS2/';
    expect(extractAppIds(content)).toEqual([570, 730]);
  });

  it('deduplicates repeated app IDs', () => {
    const content =
      'https://store.steampowered.com/app/730/CS2/ https://store.steampowered.com/app/730/CS2/';
    expect(extractAppIds(content)).toEqual([730]);
  });

  it('returns empty array for no links', () => {
    expect(extractAppIds('Just a normal message')).toEqual([]);
  });

  it('returns empty array for null or undefined', () => {
    expect(extractAppIds(null)).toEqual([]);
    expect(extractAppIds(undefined)).toEqual([]);
  });

  it('returns empty array for non-string input', () => {
    expect(extractAppIds(123)).toEqual([]);
  });

  it('handles links without trailing path', () => {
    const content = 'https://store.steampowered.com/app/440/';
    expect(extractAppIds(content)).toEqual([440]);
  });

  it('handles links without trailing slash', () => {
    const content = 'https://store.steampowered.com/app/440';
    expect(extractAppIds(content)).toEqual([440]);
  });

  it('ignores non-app Steam URLs', () => {
    const content = 'https://store.steampowered.com/publisher/valve';
    expect(extractAppIds(content)).toEqual([]);
  });

  it('handles http (non-https) links', () => {
    const content = 'http://store.steampowered.com/app/1091500/Cyberpunk_2077/';
    expect(extractAppIds(content)).toEqual([1091500]);
  });
});

describe('registerSteamLinkListener', () => {
  let mockClient;
  let mockMessage;
  let mockGameDetailsService;
  let messageHandler;

  beforeEach(() => {
    mockClient = {
      on: vi.fn((event, handler) => {
        if (event === 'messageCreate') {
          messageHandler = handler;
        }
      }),
    };

    mockMessage = {
      author: { bot: false },
      content: 'https://store.steampowered.com/app/730/CS2/',
      reply: vi.fn().mockResolvedValue(undefined),
      suppressEmbeds: vi.fn().mockResolvedValue(undefined),
    };

    mockGameDetailsService = {
      getDetails: vi.fn().mockResolvedValue({
        appId: 730,
        name: 'Counter-Strike 2',
        shortDescription: 'A competitive FPS',
        headerImage: 'https://example.com/image.jpg',
        genres: ['FPS'],
        developers: ['Valve'],
        publishers: ['Valve'],
        releaseDate: '21 Aug, 2012',
        isFreeToPlay: true,
        price: null,
        metacriticScore: 83,
        storeUrl: 'https://store.steampowered.com/app/730',
      }),
    };

    registerSteamLinkListener(mockClient, {
      gameDetailsService: mockGameDetailsService,
    });
  });

  it('registers a messageCreate listener', () => {
    expect(mockClient.on).toHaveBeenCalledWith('messageCreate', expect.any(Function));
  });

  it('ignores messages from bots', async () => {
    mockMessage.author.bot = true;
    await messageHandler(mockMessage);
    expect(mockGameDetailsService.getDetails).not.toHaveBeenCalled();
  });

  it('ignores messages without Steam links', async () => {
    mockMessage.content = 'Just chatting about games';
    await messageHandler(mockMessage);
    expect(mockGameDetailsService.getDetails).not.toHaveBeenCalled();
  });

  it('fetches details and replies with an embed for a valid link', async () => {
    await messageHandler(mockMessage);

    expect(mockGameDetailsService.getDetails).toHaveBeenCalledWith(730);
    expect(mockMessage.reply).toHaveBeenCalledWith({
      embeds: [expect.any(Object)],
      allowedMentions: { repliedUser: false },
    });
  });

  it('suppresses embeds on the original message', async () => {
    await messageHandler(mockMessage);
    expect(mockMessage.suppressEmbeds).toHaveBeenCalledWith(true);
  });

  it('does not crash if suppressEmbeds fails (missing permission)', async () => {
    mockMessage.suppressEmbeds.mockRejectedValue(new Error('Missing Permissions'));
    await messageHandler(mockMessage);

    // Should still have replied successfully
    expect(mockMessage.reply).toHaveBeenCalled();
  });

  it('does not reply if getDetails throws', async () => {
    mockGameDetailsService.getDetails.mockRejectedValue(new Error('API failure'));
    await messageHandler(mockMessage);

    expect(mockMessage.reply).not.toHaveBeenCalled();
  });

  it('limits processing to 3 links per message', async () => {
    mockMessage.content = [
      'https://store.steampowered.com/app/1/',
      'https://store.steampowered.com/app/2/',
      'https://store.steampowered.com/app/3/',
      'https://store.steampowered.com/app/4/',
    ].join(' ');

    await messageHandler(mockMessage);

    expect(mockGameDetailsService.getDetails).toHaveBeenCalledTimes(3);
    expect(mockGameDetailsService.getDetails).not.toHaveBeenCalledWith(4);
  });
});
