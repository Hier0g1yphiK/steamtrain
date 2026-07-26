# Design Document: Steam Discord Bot

## Overview

A Discord bot built with Node.js and discord.js v14+ that provides Steam game and user lookup functionality via slash commands. The bot uses a modular command registry pattern for extensibility, an in-memory LRU cache to reduce redundant Steam API calls, and displays results as rich Discord embeds.

The system is designed as the first phase of a larger platform, so the architecture prioritizes clean separation of concerns, easy addition of new commands, and a clear service layer boundary around external API calls.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Node.js 20+ | Native fetch support, modern ESM, active LTS |
| Discord library | discord.js v14+ | Mature, well-typed, first-class slash command support |
| HTTP client | Native `fetch` | Built into Node 20+, no extra dependency |
| Cache | `lru-cache` npm package | Battle-tested, supports TTL + max size, zero config |
| Module system | ESM (`type: "module"`) | Modern standard, tree-shakeable, top-level await |
| Secrets | `dotenv` | Standard .env loading, does not override existing env vars |
| Testing | Vitest + fast-check | Fast ESM-native test runner, mature property-based testing |

## Architecture

The bot follows a layered architecture with clear boundaries between Discord interaction handling, business logic, and external API access.

```mermaid
graph TD
    subgraph Discord Layer
        A[Discord Gateway] --> B[Interaction Handler]
        B --> C[Command Registry]
    end

    subgraph Command Layer
        C --> D[/game command]
        C --> E[/steamuser command]
    end

    subgraph Service Layer
        D --> F[GameSearchService]
        D --> G[GameDetailsService]
        E --> H[UserResolveService]
        E --> I[UserProfileService]
    end

    subgraph Infrastructure Layer
        F --> J[SteamAPI Client]
        G --> J
        H --> J
        I --> J
        J --> K[Cache]
        J --> L[Steam Web API]
    end
```

### Directory Structure

```
steamtrain/
├── src/
│   ├── index.js              # Entry point: load env, create client, login
│   ├── bot.js                # Bot setup: intents, event handlers
│   ├── registry.js           # Command registry: discover, validate, register
│   ├── commands/
│   │   ├── game.js           # /game command handler
│   │   └── steamuser.js      # /steamuser command handler
│   ├── services/
│   │   ├── gameSearch.js     # Game search + fallback logic
│   │   ├── gameDetails.js    # App details fetching + formatting
│   │   ├── userResolve.js    # SteamID64 resolution (URL, vanity, raw)
│   │   └── userProfile.js    # Player summary + owned games
│   ├── api/
│   │   └── steamClient.js    # HTTP wrapper with timeout, error handling, caching
│   ├── cache/
│   │   └── cacheManager.js   # LRU cache instances with per-type TTL/maxSize
│   ├── embeds/
│   │   ├── gameEmbed.js      # Game details embed builder
│   │   └── userEmbed.js      # User profile embed builder
│   └── utils/
│       ├── config.js         # Environment variable loading + validation
│       ├── errors.js         # Custom error types
│       └── logger.js         # Structured logging utility
├── .env.example
├── package.json
└── vitest.config.js
```

## Components and Interfaces

### Command Registry (`registry.js`)

Responsible for dynamically discovering command modules, validating their exports, and registering them with Discord's REST API.

```javascript
// Command module interface (each file in commands/ must export):
export const command = {
  name: string,           // 1-32 chars, lowercase
  description: string,    // 1-100 chars
  options: Array,         // SlashCommandBuilder options array
};
export async function execute(interaction) { /* ... */ }
```

**Behavior:**
- On startup, reads all `.js` files from `src/commands/`
- Validates each module exports `command` object and `execute` function
- Validates `command.name` is 1-32 chars, `command.description` is 1-100 chars
- Detects duplicate command names — keeps first loaded, logs error for duplicates
- Registers valid commands with Discord REST API using `@discordjs/rest`
- Stores command handlers in a `Map<name, execute>` for runtime dispatch

### Steam API Client (`api/steamClient.js`)

A thin HTTP wrapper around Steam endpoints that enforces timeouts, handles errors consistently, and integrates with the cache layer.

```javascript
class SteamClient {
  constructor(apiKey, cache)

  // Store search — no API key required
  async searchStore(term, cc = 'gb')

  // App details — no API key required  
  async getAppDetails(appId, cc = 'gb', filters = [])

  // Full app list — no API key required
  async getAppList()

  // Resolve vanity URL — requires API key
  async resolveVanityURL(vanityName)

  // Player summaries — requires API key
  async getPlayerSummaries(steamIds)

  // Owned games — requires API key
  async getOwnedGames(steamId)
}
```

**Timeout:** All requests use `AbortController` with a 10-second signal. On timeout, a `TimeoutError` is thrown.

**Error handling:** Non-2xx responses throw an `ApiError` with status code and truncated body (max 1024 chars).

### Cache Manager (`cache/cacheManager.js`)

Provides pre-configured LRU cache instances for different data types using the `lru-cache` npm package.

```javascript
// Cache instances
const appListCache    // max: 1, TTL: 24 hours
const gameDetailCache // max: 1000, TTL: 1 hour
const userProfileCache // max: 500, TTL: 5 minutes
```

**Stale-while-revalidate behavior:** When a cached entry has expired and the fresh fetch fails, the expired value is served and a warning is logged. This is implemented using `lru-cache`'s `allowStale` option combined with a manual fetch-or-fallback pattern in the SteamClient.

### Game Search Service (`services/gameSearch.js`)

```javascript
class GameSearchService {
  constructor(steamClient)

  // Returns { match: GameResult | null, candidates: GameResult[] }
  async search(name)
}
```

**Algorithm:**
1. Query storefront search endpoint with the name
2. If the API fails, fall back to fuzzy matching against the cached app list
3. If one result has similarity ≥ 90%, return it as a direct match
4. If 2+ results have similarity > 60%, return up to 5 as candidates
5. If no results exceed 60% similarity, return no matches

### Game Details Service (`services/gameDetails.js`)

```javascript
class GameDetailsService {
  constructor(steamClient)

  // Returns GameDetails object or throws
  async getDetails(appId)
}
```

Fetches from Steam's `appdetails` endpoint with filters: `price_overview`, `short_description`, `header_image`, `genres`, `release_date`, `developers`, `publishers`, `metacritic`. Uses region code `gb` for GBP pricing.

### User Resolve Service (`services/userResolve.js`)

```javascript
class UserResolveService {
  constructor(steamClient)

  // Returns { steamId64: string } or throws UserNotFoundError
  async resolve(query)
}
```

**Resolution order:**
1. If input matches `https://steamcommunity.com/profiles/<digits>` → extract SteamID64
2. If input matches `https://steamcommunity.com/id/<name>` → resolve via vanity API
3. If input is a 17-digit number → use directly
4. Otherwise treat as vanity name → resolve via vanity API
5. If none match → throw `InvalidInputError` with accepted formats

### User Profile Service (`services/userProfile.js`)

```javascript
class UserProfileService {
  constructor(steamClient)

  // Returns UserProfile object
  async getProfile(steamId64)
}
```

Fetches player summary. If profile is public (`communityvisibilitystate === 3`), also fetches owned game count.

### Embed Builders (`embeds/`)

Pure functions that transform service response objects into Discord `EmbedBuilder` instances.

```javascript
// gameEmbed.js
export function buildGameEmbed(gameDetails) → EmbedBuilder

// userEmbed.js  
export function buildUserEmbed(userProfile) → EmbedBuilder
```

**Game embed fields:** title (linked to store page), header image, short description (truncated to 300 chars), genres, developers, publishers, release date, price (formatted per discount/free-to-play rules), metacritic score (if available).

**User embed fields:** persona name as title, avatar thumbnail, profile URL link, online status, visibility, country (if public), game count (if public).

## Data Models

### GameResult

```javascript
{
  appId: number,
  name: string,
  similarity: number  // 0-100, similarity score from search
}
```

### GameDetails

```javascript
{
  appId: number,
  name: string,
  shortDescription: string,      // max 300 chars (truncated)
  headerImage: string,           // URL
  genres: string[],
  developers: string[],
  publishers: string[],
  releaseDate: string,           // formatted date string
  isFreeToPlay: boolean,
  price: {
    currency: 'GBP',
    current: number,             // price in pence
    original: number | null,     // non-null if discounted
    discountPercent: number,     // 0 if no discount
  } | null,                      // null if free-to-play
  metacriticScore: number | null,
  storeUrl: string               // https://store.steampowered.com/app/{appId}
}
```

### UserProfile

```javascript
{
  steamId64: string,
  personaName: string,
  avatarUrl: string,
  profileUrl: string,
  onlineStatus: 'Online' | 'Offline' | 'Away' | 'Snooze' | 'Looking to Trade' | 'Looking to Play',
  visibility: 'Public' | 'Private',
  country: string | null,        // ISO country code, null if private/unavailable
  gameCount: number | null       // null if profile is private
}
```

### CacheEntry (internal)

```javascript
{
  key: string,
  value: any,
  ttl: number,        // milliseconds
  createdAt: number   // Date.now() at insertion
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Game name validation boundary

*For any* string input, the game name validation SHALL accept it if and only if its trimmed length is between 1 and 200 characters (inclusive). Strings of length 0 or greater than 200 SHALL be rejected with a validation error.

**Validates: Requirements 1.1, 1.2**

### Property 2: Search result threshold routing

*For any* non-empty list of search results with similarity scores, the selection algorithm SHALL:
- Auto-select the single result if exactly one has similarity ≥ 90%
- Return the top 5 (at most) as candidates if 2 or more have similarity > 60%
- Return "no results" if no result has similarity > 60%

**Validates: Requirements 1.4, 1.5, 1.7**

### Property 3: Game embed completeness and conditional fields

*For any* valid GameDetails object, the generated embed SHALL contain: game title (linked to store URL), header image, short description (≤ 300 characters), genres, developers, publishers, and release date. If `metacriticScore` is non-null, the embed SHALL include it; if null, the embed SHALL omit the metacritic field entirely.

**Validates: Requirements 2.2, 2.8, 2.9**

### Property 4: Price display formatting

*For any* GameDetails object:
- If `isFreeToPlay` is true, the price field SHALL display "Free to Play"
- If a discount is active (`discountPercent > 0`), the price field SHALL contain the original price with strikethrough, the discounted price, and the discount percentage, all in GBP with £ symbol
- If no discount is active, the price field SHALL display the current price in GBP formatted as `£X.XX`

**Validates: Requirements 2.3, 2.4, 2.5**

### Property 5: Steam user input format detection

*For any* string input to the user resolve service:
- If it matches `https://steamcommunity.com/profiles/<17-digit number>`, the SteamID64 SHALL be extracted directly from the URL
- If it matches `https://steamcommunity.com/id/<name>` or is a non-numeric string, it SHALL be routed to vanity URL resolution
- If it is exactly a 17-digit numeric string, it SHALL be used directly as the SteamID64

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 6: User embed completeness

*For any* valid UserProfile object, the generated embed SHALL contain: persona name as title, avatar as thumbnail, profile URL as link, online status, and visibility. If the profile is public and `country` is non-null, the embed SHALL include the country. If the profile is public and `gameCount` is non-null, the embed SHALL include the game count.

**Validates: Requirements 3.7**

### Property 7: Command module validation

*For any* module loaded by the command registry, it SHALL be accepted if and only if it exports a `command` object with a `name` (1-32 chars), a `description` (1-100 chars), an `options` array, and an `execute` function. Modules failing this check SHALL be skipped and an error logged.

**Validates: Requirements 4.4, 4.5**

### Property 8: Duplicate command name detection

*For any* set of command modules where two or more define the same `command.name`, the registry SHALL register only the first-loaded module with that name and reject subsequent duplicates with a logged error.

**Validates: Requirements 4.6**

### Property 9: Cache TTL freshness

*For any* cache entry stored with a given TTL, retrieving that entry before the TTL elapses SHALL return the cached value. Retrieving after the TTL elapses SHALL treat the entry as stale (triggering a refresh attempt).

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 10: LRU eviction at capacity

*For any* sequence of cache insertions that exceeds the configured maximum size (1000 for game details, 500 for user profiles), the least-recently-used entry SHALL be evicted, and the cache size SHALL never exceed the maximum.

**Validates: Requirements 5.7**

### Property 11: Error log truncation

*For any* error response body (from non-2xx status or unparseable response), the logged content SHALL be truncated to at most 1024 characters. The user-facing response SHALL be a generic failure message that does not contain the raw response body.

**Validates: Requirements 7.4, 7.5**

## Error Handling

### Strategy

The bot uses a layered error handling approach:

1. **HTTP Layer** (`steamClient.js`): Catches network errors, timeouts, and non-2xx responses. Wraps them in typed errors (`TimeoutError`, `ApiError`, `ParseError`).

2. **Service Layer** (`services/`): Catches API-layer errors and translates them to domain errors (`GameNotFoundError`, `UserNotFoundError`, `RegionUnavailableError`). Implements fallback logic (e.g., stale cache on fetch failure).

3. **Command Layer** (`commands/`): Catches service errors and maps them to user-facing messages via `editReply`. A top-level try/catch ensures no unhandled exception escapes.

4. **Bot Layer** (`bot.js`): Global `interactionCreate` handler wraps dispatch in a try/catch as a final safety net.

### Error Types

```javascript
class BotError extends Error { }
class TimeoutError extends BotError { }
class ApiError extends BotError {
  constructor(message, statusCode, responseBody) { }
}
class ParseError extends BotError { }
class GameNotFoundError extends BotError { }
class UserNotFoundError extends BotError { }
class InvalidInputError extends BotError { }
class RegionUnavailableError extends BotError { }
```

### Deferred Reply Pattern

Every command handler follows this pattern:

```javascript
export async function execute(interaction) {
  await interaction.deferReply();
  try {
    // ... service calls, embed building
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    const message = mapErrorToUserMessage(error);
    await interaction.editReply({ content: message });
    logger.error({
      command: interaction.commandName,
      input: interaction.options.data,
      errorType: error.constructor.name,
      errorMessage: error.message,
    });
  }
}
```

### Logging

Errors are logged with structured fields:
- `command`: The slash command name
- `input`: User-provided parameters (never secrets)
- `errorType`: Error class name
- `errorMessage`: Error message
- `statusCode`: HTTP status code (if applicable)
- `responseBody`: Truncated to 1024 characters (if applicable)

Secrets (`DISCORD_TOKEN`, `STEAM_API_KEY`) are never included in logs, error messages, or stack traces.

## Testing Strategy

### Dual Approach

The testing strategy combines property-based tests for universal correctness guarantees with example-based unit tests for specific scenarios and integration points.

### Property-Based Tests (Vitest + fast-check)

Each correctness property is implemented as a property-based test using [fast-check](https://github.com/dubzzz/fast-check) with a minimum of 100 iterations.

| Property | Target Module | Generator Strategy |
|----------|--------------|-------------------|
| 1: Game name validation | `commands/game.js` | `fc.string()` with varying lengths |
| 2: Search threshold routing | `services/gameSearch.js` | `fc.array(fc.record({ name: fc.string(), similarity: fc.integer(0, 100) }))` |
| 3: Game embed completeness | `embeds/gameEmbed.js` | `fc.record()` matching GameDetails shape |
| 4: Price formatting | `embeds/gameEmbed.js` | `fc.record()` with price variants |
| 5: User input format detection | `services/userResolve.js` | `fc.oneof()` generating profile URLs, vanity URLs, SteamID64s |
| 6: User embed completeness | `embeds/userEmbed.js` | `fc.record()` matching UserProfile shape |
| 7: Command module validation | `registry.js` | `fc.record()` with valid/invalid module shapes |
| 8: Duplicate detection | `registry.js` | `fc.array()` of module objects with overlapping names |
| 9: Cache TTL freshness | `cache/cacheManager.js` | `fc.nat()` for TTL values, `fc.anything()` for values |
| 10: LRU eviction | `cache/cacheManager.js` | `fc.array()` of key-value pairs exceeding max size |
| 11: Error log truncation | `api/steamClient.js` | `fc.string()` with lengths spanning the 1024 boundary |

**Tag format:** Each test includes a comment: `// Feature: steam-discord-bot, Property {N}: {title}`

**Configuration:** Minimum 100 iterations per property (`numRuns: 100`).

### Example-Based Unit Tests

| Area | What's Tested |
|------|--------------|
| Storefront fallback | API failure triggers fuzzy match against cached app list |
| Deferred reply ordering | `deferReply()` called before any API work |
| Stale cache serving | Expired entry returned when refresh fails |
| Vanity not found | `success !== 1` produces user-friendly error |
| Top-level error boundary | Unhandled exception in handler → generic error to user |
| `.env.example` | File exists with expected placeholder keys |

### Integration Tests

| Area | What's Tested |
|------|--------------|
| Command registration | Bot startup registers commands with Discord API |
| Component timeout | Selection menu disabled after 30s |
| Full command flow | `/game` and `/steamuser` produce expected embeds (mocked Steam API) |

### Test Runner

- **Vitest** with `--run` flag for CI (no watch mode)
- Tests in `tests/` directory mirroring `src/` structure
- `vitest.config.js` configured for ESM with `lru-cache` as external

