# SteamTrain Project Steering

## Project Overview

SteamTrain is a Discord bot for game lookup (via IGDB) and Steam user profiles via slash commands. Built with Node.js 20+, discord.js v14, and ESM modules.

## Tech Stack

- **Runtime:** Node.js 20+ (native fetch, top-level await)
- **Discord:** discord.js v14, @discordjs/rest
- **APIs:** IGDB API v4 (Twitch OAuth2), Steam Web API
- **Cache:** lru-cache (in-memory LRU with TTL)
- **Config:** dotenv
- **Testing:** Vitest + fast-check (property-based testing)
- **Module system:** ESM (`"type": "module"`)

## Code Conventions

- All source files use ESM (`import`/`export`)
- No TypeScript — plain JavaScript with JSDoc comments
- Custom error classes extend `BotError` (see `src/utils/errors.js`)
- Structured JSON logging via `src/utils/logger.js` — never include secrets
- Services accept dependencies via constructor injection
- Command handlers accept a `deps`/`services` object as second argument for testability

## Architecture Patterns

- **Layered architecture:** Discord → Commands → Services → API Clients → Cache
- **Multi-client design:** `SteamClient` for Steam API, `IgdbClient` for IGDB API (Twitch OAuth2)
- **Deferred reply pattern:** Every command calls `deferReply()` before any async work
- **Stale-while-revalidate:** Expired cache entries served on fetch failure
- **Command registry:** Auto-discovers `.js` files in `src/commands/`, validates exports, registers with Discord REST

## Commands

- `/game` — Universal game lookup via IGDB (all platforms/stores)
- `/steamgame` — Steam-specific game lookup with pricing
- `/steamuser` — Steam profile lookup
- **Steam link auto-embed** — Listens for `store.steampowered.com/app/` URLs in messages

## Testing Standards

- Every new feature needs both unit tests and property-based tests where applicable
- Property tests use fast-check with `numRuns: 100` minimum
- Tag property tests: `// Feature: steam-discord-bot, Property N: Title`
- Mock external dependencies (Steam API, IGDB API, Discord) — never make real network calls in tests
- Run tests with `npm test` (vitest --run, no watch mode)

## File Naming

- Source: `src/{layer}/{module}.js`
- Unit tests: `src/{layer}/{module}.test.js`
- Property tests: `src/{layer}/{module}.property.test.js`
- Integration tests: `tests/{layer}/{name}.property.test.js`

## Adding New Commands

1. Create `src/commands/{name}.js` exporting `command` object and `execute` function
2. Create `src/commands/{name}.test.js` with unit tests
3. The registry auto-discovers on restart — no other files need changes
4. If the command needs new services, wire them in `src/index.js` and pass via `services` object

## Adding a New API Client

1. Create `src/api/{name}Client.js` with timeout, error handling, and cache support
2. Add cache instances to `src/cache/cacheManager.js` if needed
3. Create corresponding services in `src/services/`
4. Wire in `src/index.js`

## Error Handling

- HTTP errors → `ApiError` or `TimeoutError`
- Domain errors → `GameNotFoundError`, `UserNotFoundError`, `RegionUnavailableError`, `InvalidInputError`
- Commands map errors to user-friendly messages via `mapErrorToUserMessage()`
- Bot-level error boundary catches anything that escapes command handlers

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DISCORD_TOKEN` | Discord bot token |
| `DISCORD_APPLICATION_ID` | For slash command registration |
| `STEAM_API_KEY` | Steam Web API access |
| `TWITCH_CLIENT_ID` | IGDB API authentication (Twitch OAuth2) |
| `TWITCH_CLIENT_SECRET` | IGDB API authentication (Twitch OAuth2) |

## Build & Run

```bash
npm install     # install dependencies
npm test        # run all tests
npm start       # start the bot (requires .env)
```
