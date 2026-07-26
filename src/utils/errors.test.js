import { describe, it, expect } from 'vitest';
import {
  BotError,
  TimeoutError,
  ApiError,
  ParseError,
  GameNotFoundError,
  UserNotFoundError,
  InvalidInputError,
  RegionUnavailableError,
} from './errors.js';

describe('Error Types', () => {
  it('BotError extends Error', () => {
    const err = new BotError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BotError);
    expect(err.message).toBe('test');
    expect(err.name).toBe('BotError');
  });

  it('TimeoutError extends BotError with default message', () => {
    const err = new TimeoutError();
    expect(err).toBeInstanceOf(BotError);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Request timed out');
    expect(err.name).toBe('TimeoutError');
  });

  it('TimeoutError accepts custom message', () => {
    const err = new TimeoutError('custom timeout');
    expect(err.message).toBe('custom timeout');
  });

  it('ApiError stores statusCode and responseBody', () => {
    const err = new ApiError('Bad request', 400, '{"error": "bad"}');
    expect(err).toBeInstanceOf(BotError);
    expect(err.message).toBe('Bad request');
    expect(err.statusCode).toBe(400);
    expect(err.responseBody).toBe('{"error": "bad"}');
    expect(err.name).toBe('ApiError');
  });

  it('ApiError truncates responseBody to 1024 characters', () => {
    const longBody = 'x'.repeat(2000);
    const err = new ApiError('error', 500, longBody);
    expect(err.responseBody.length).toBe(1024);
  });

  it('ParseError extends BotError with default message', () => {
    const err = new ParseError();
    expect(err).toBeInstanceOf(BotError);
    expect(err.message).toBe('Failed to parse response');
    expect(err.name).toBe('ParseError');
  });

  it('GameNotFoundError extends BotError', () => {
    const err = new GameNotFoundError();
    expect(err).toBeInstanceOf(BotError);
    expect(err.message).toBe('Game not found');
    expect(err.name).toBe('GameNotFoundError');
  });

  it('UserNotFoundError extends BotError', () => {
    const err = new UserNotFoundError();
    expect(err).toBeInstanceOf(BotError);
    expect(err.message).toBe('User not found');
    expect(err.name).toBe('UserNotFoundError');
  });

  it('InvalidInputError extends BotError', () => {
    const err = new InvalidInputError();
    expect(err).toBeInstanceOf(BotError);
    expect(err.message).toBe('Invalid input');
    expect(err.name).toBe('InvalidInputError');
  });

  it('RegionUnavailableError extends BotError', () => {
    const err = new RegionUnavailableError();
    expect(err).toBeInstanceOf(BotError);
    expect(err.message).toBe('Game not available in the selected region');
    expect(err.name).toBe('RegionUnavailableError');
  });

  it('all error types are catchable as BotError', () => {
    const errors = [
      new TimeoutError(),
      new ApiError('err', 500, 'body'),
      new ParseError(),
      new GameNotFoundError(),
      new UserNotFoundError(),
      new InvalidInputError(),
      new RegionUnavailableError(),
    ];

    for (const err of errors) {
      expect(err).toBeInstanceOf(BotError);
    }
  });
});
