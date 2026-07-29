# SteamTrain

A Discord bot for looking up games and Steam user profiles via slash commands. Game search is powered by IGDB (covers all platforms), with a dedicated Steam command for store-specific details. Results are displayed as rich embeds.

## Features

- `/game <name>` — Search for any game by name via IGDB. Shows platforms, genres, developers, ratings, and store links (Steam, Epic, GOG).
- `/steamgame <name>` — Search for a Steam game by name via the Steam store. Shows pricing (GBP), genres, developers, metacritic score, and more.
- `/steamuser <query>` — Look up a Steam profile by URL, vanity name, or SteamID64. Shows online status, game count, and visibility.
- `/watchlist add <game>` — Add a Steam game to the server's sale watchlist.
- `/watchlist remove <game>` — Remove a game from the watchlist.
- `/watchlist list` — Show all watched games and their current discount status.
- `/watchlist channel <#channel>` — Set the channel for sale notifications (requires Manage Server).
- **Auto-embed Steam links** — When someone posts a `store.steampowered.com/app/...` URL, the bot replies with a rich embed automatically.
- **Sale notifications** — The bot checks prices every 2 hours and posts to the configured channel when a watched game goes on sale or gets a deeper discount.

### Highlights

- IGDB integration for cross-platform game lookup (all stores and platforms)
- Steam store search with fuzzy matching and automatic fallback to full app list
- Server-level game watchlist with automatic sale notifications via SQLite persistence
- Interactive selection menu when multiple matches are found
- In-memory LRU caching with stale-while-revalidate
- Modular command registry — add new commands by dropping a file in `src/commands/`
- Property-based test suite (fast-check, 312 tests)

## Prerequisites

- Node.js 20+
- A [Discord application](https://discord.com/developers/applications) with a bot token
- A [Steam Web API key](https://steamcommunity.com/dev/apikey)
- A [Twitch Developer application](https://dev.twitch.tv/console/apps) (for IGDB API access)

## Setup

```bash
git clone <repo-url>
cd steamtrain
npm install

cp .env.example .env
# Edit .env with your tokens
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Discord bot token |
| `DISCORD_APPLICATION_ID` | Discord application ID (for command registration) |
| `STEAM_API_KEY` | Steam Web API key |
| `TWITCH_CLIENT_ID` | Twitch/IGDB Client ID |
| `TWITCH_CLIENT_SECRET` | Twitch/IGDB Client Secret |

## Running

```bash
npm start
```

The bot registers slash commands with Discord on startup and begins listening for interactions.

## Testing

```bash
npm test
```

Runs all tests (unit + property-based) via Vitest. Single pass, no watch mode.

## Architecture

```
src/
├── index.js              # Entry point — wires all layers, logs in
├── bot.js                # Discord client, interaction dispatch, error boundary
├── registry.js           # Command discovery, validation, registration
├── commands/             # Slash command handlers (one per file)
│   ├── game.js           # /game — IGDB-powered universal game lookup
│   ├── steamgame.js      # /steamgame — Steam store game lookup
│   ├── steamuser.js      # /steamuser — Steam profile lookup
│   └── watchlist.js      # /watchlist — Server sale watchlist management
├── services/             # Business logic
│   ├── igdbGameSearch.js # IGDB game search with similarity scoring
│   ├── igdbGameDetails.js# IGDB game details + store link extraction
│   ├── gameSearch.js     # Steam store search + fuzzy matching
│   ├── gameDetails.js    # Steam app details
│   ├── saleChecker.js    # Background price polling & sale notifications
│   ├── userResolve.js    # Vanity URL / SteamID resolution
│   └── userProfile.js    # Steam user profile
├── store/                # Persistent storage
│   └── watchlistStore.js # SQLite-backed watchlist & guild settings
├── api/                  # External API clients
│   ├── igdbClient.js     # IGDB API v4 client (Twitch OAuth2)
│   └── steamClient.js    # Steam Web API client
├── cache/                # LRU cache instances
├── embeds/               # Discord embed builders
│   ├── igdbGameEmbed.js  # Embed for IGDB game results
│   ├── gameEmbed.js      # Embed for Steam game results
│   ├── saleEmbed.js      # Embed for sale notifications
│   └── userEmbed.js      # Embed for Steam user profiles
├── listeners/            # Message event listeners
│   └── steamLink.js      # Auto-embed Steam store links
└── utils/                # Config, errors, logger
data/
└── watchlist.db          # SQLite database (auto-created, gitignored)
```

### Caching

| Data | Max Entries | TTL |
|------|-------------|-----|
| Steam app list | 1 | 24 hours |
| Steam game details | 1,000 | 1 hour |
| User profiles | 500 | 5 minutes |
| IGDB game details | 500 | 1 hour |

Stale entries are served when a refresh fails (stale-while-revalidate).

### Persistence

The watchlist feature uses SQLite (via `better-sqlite3`) stored at `data/watchlist.db`. The database is auto-created on first run and is gitignored. It stores:

- Per-guild game watchlists (app ID, name, last known price/discount)
- Per-guild notification channel settings

## Adding a New Command

Create a file in `src/commands/` that exports:

```javascript
export const command = {
  name: 'mycommand',
  description: 'Does a thing',
  options: [],
};

export async function execute(interaction, services) {
  await interaction.deferReply();
  // your logic here
  await interaction.editReply({ content: 'Done!' });
}
```

The registry picks it up on next restart. No other files need changes.

## License

ISC
