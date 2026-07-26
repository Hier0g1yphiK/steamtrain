# SteamTrain Project Steering

## Project Overview

SteamTrain is a Discord bot for Steam game and user lookup via slash commands. Built with Node.js 20+, discord.js v14, and ESM modules.

## Tech Stack

- **Runtime:** Node.js 20+ (native fetch, top-level await)
- **Discord:** discord.js v14, @discordjs/rest
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

- **Layered architecture:** Discord → Commands → Services → API Client → Cache
- **Deferred reply pattern:** Every command calls `deferReply()` before any async work
- **Stale-while-revalidate:** Expired cache entries served on fetch failure
- **Command registry:** Auto-discovers `.js` files in `src/commands/`, validates exports, registers with Discord REST

## Testing Standards

- Every new feature needs both unit tests and property-based tests where applicable
- Property tests use fast-check with `numRuns: 100` minimum
- Tag property tests: `// Feature: steam-discord-bot, Property N: Title`
- Mock external dependencies (Steam API, Discord) — never make real network calls in tests
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

## Error Handling

- HTTP errors → `ApiError` or `TimeoutError`
- Domain errors → `GameNotFoundError`, `UserNotFoundError`, `RegionUnavailableError`, `InvalidInputError`
- Commands map errors to user-friendly messages via `mapErrorToUserMessage()`
- Bot-level error boundary catches anything that escapes command handlers

## Build & Run

```bash
npm install     # install dependencies
npm test        # run all tests
npm start       # start the bot (requires .env)
```
