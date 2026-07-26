# SteamTrain

A Discord bot for looking up Steam games and user profiles via slash commands. Results are displayed as rich embeds with pricing, metadata, and profile information.

## Features

- `/game <name>` — Search for a Steam game by name. Shows pricing (GBP), genres, developers, metacritic score, and more.
- `/steamuser <query>` — Look up a Steam profile by URL, vanity name, or SteamID64. Shows online status, game count, and visibility.

### Highlights

- Fuzzy search with automatic fallback to the full Steam app list
- Interactive selection menu when multiple matches are found
- In-memory LRU caching with stale-while-revalidate
- Modular command registry — add new commands by dropping a file in `src/commands/`
- Property-based test suite (11 correctness properties, 239 tests)

## Prerequisites

- Node.js 20+
- A [Discord application](https://discord.com/developers/applications) with a bot token
- A [Steam Web API key](https://steamcommunity.com/dev/apikey)

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
| `STEAM_API_KEY` | Steam Web API key |
| `DISCORD_APPLICATION_ID` | Discord application ID (for command registration) |

## Running

```bash
npm start
```

The bot registers slash commands with Discord on startup and begins listening for interactions.

## Testing

```bash
npm test
```

Runs all 239 tests (unit + property-based) via Vitest. Single pass, no watch mode.

## Architecture

```
src/
├── index.js              # Entry point — wires all layers, logs in
├── bot.js                # Discord client, interaction dispatch, error boundary
├── registry.js           # Command discovery, validation, registration
├── commands/             # Slash command handlers (one per file)
├── services/             # Business logic (search, details, resolve, profile)
├── api/                  # Steam API client with timeout + caching
├── cache/                # LRU cache instances
├── embeds/               # Discord embed builders
└── utils/                # Config, errors, logger
```

### Caching

| Data | Max Entries | TTL |
|------|-------------|-----|
| App list | 1 | 24 hours |
| Game details | 1,000 | 1 hour |
| User profiles | 500 | 5 minutes |

Stale entries are served when a refresh fails (stale-while-revalidate).

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
