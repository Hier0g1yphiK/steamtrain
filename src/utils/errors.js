/**
 * Custom error types for the Steam Discord bot.
 * Layered hierarchy: BotError → specific error types.
 */

export class BotError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BotError';
  }
}

export class TimeoutError extends BotError {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class ApiError extends BotError {
  constructor(message, statusCode, responseBody) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.responseBody =
      typeof responseBody === 'string' && responseBody.length > 1024
        ? responseBody.slice(0, 1024)
        : responseBody;
  }
}

export class ParseError extends BotError {
  constructor(message = 'Failed to parse response') {
    super(message);
    this.name = 'ParseError';
  }
}

export class GameNotFoundError extends BotError {
  constructor(message = 'Game not found') {
    super(message);
    this.name = 'GameNotFoundError';
  }
}

export class UserNotFoundError extends BotError {
  constructor(message = 'User not found') {
    super(message);
    this.name = 'UserNotFoundError';
  }
}

export class InvalidInputError extends BotError {
  constructor(message = 'Invalid input') {
    super(message);
    this.name = 'InvalidInputError';
  }
}

export class RegionUnavailableError extends BotError {
  constructor(message = 'Game not available in the selected region') {
    super(message);
    this.name = 'RegionUnavailableError';
  }
}
