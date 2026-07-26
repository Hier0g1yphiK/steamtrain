import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateCommandModule, loadCommands, buildHandlerMap } from './registry.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('validateCommandModule', () => {
  const validModule = {
    command: {
      name: 'test',
      description: 'A test command',
      options: [],
    },
    execute: async () => {},
  };

  it('accepts a valid module', () => {
    const result = validateCommandModule(validModule, '/test/path.js');
    expect(result.valid).toBe(true);
  });

  it('rejects null module', () => {
    const result = validateCommandModule(null, '/test/path.js');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('does not export an object');
  });

  it('rejects module without command object', () => {
    const result = validateCommandModule({ execute: async () => {} }, '/test/path.js');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('does not export a command object');
  });

  it('rejects command with empty name', () => {
    const mod = { command: { name: '', description: 'desc', options: [] }, execute: async () => {} };
    const result = validateCommandModule(mod, '/test/path.js');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('invalid command.name');
  });

  it('rejects command with name longer than 32 chars', () => {
    const mod = {
      command: { name: 'a'.repeat(33), description: 'desc', options: [] },
      execute: async () => {},
    };
    const result = validateCommandModule(mod, '/test/path.js');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('invalid command.name');
  });

  it('rejects command with empty description', () => {
    const mod = { command: { name: 'test', description: '', options: [] }, execute: async () => {} };
    const result = validateCommandModule(mod, '/test/path.js');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('invalid command.description');
  });

  it('rejects command with description longer than 100 chars', () => {
    const mod = {
      command: { name: 'test', description: 'a'.repeat(101), options: [] },
      execute: async () => {},
    };
    const result = validateCommandModule(mod, '/test/path.js');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('invalid command.description');
  });

  it('rejects command with non-array options', () => {
    const mod = {
      command: { name: 'test', description: 'desc', options: 'not-array' },
      execute: async () => {},
    };
    const result = validateCommandModule(mod, '/test/path.js');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('invalid command.options');
  });

  it('rejects module without execute function', () => {
    const mod = { command: { name: 'test', description: 'desc', options: [] } };
    const result = validateCommandModule(mod, '/test/path.js');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('does not export an execute function');
  });

  it('rejects module where execute is not a function', () => {
    const mod = {
      command: { name: 'test', description: 'desc', options: [] },
      execute: 'not-a-function',
    };
    const result = validateCommandModule(mod, '/test/path.js');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('does not export an execute function');
  });

  it('accepts command with name at 32 chars boundary', () => {
    const mod = {
      command: { name: 'a'.repeat(32), description: 'desc', options: [] },
      execute: async () => {},
    };
    const result = validateCommandModule(mod, '/test/path.js');
    expect(result.valid).toBe(true);
  });

  it('accepts command with description at 100 chars boundary', () => {
    const mod = {
      command: { name: 'test', description: 'a'.repeat(100), options: [] },
      execute: async () => {},
    };
    const result = validateCommandModule(mod, '/test/path.js');
    expect(result.valid).toBe(true);
  });
});

describe('loadCommands', () => {
  let testDir;

  beforeEach(async () => {
    testDir = join(tmpdir(), `registry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
  });

  it('loads valid command modules from a directory', async () => {
    const moduleContent = `
      export const command = { name: 'hello', description: 'Say hello', options: [] };
      export async function execute() { return 'hello'; }
    `;
    await writeFile(join(testDir, 'hello.js'), moduleContent);

    const commands = await loadCommands(testDir);
    expect(commands).toHaveLength(1);
    expect(commands[0].command.name).toBe('hello');
    expect(typeof commands[0].execute).toBe('function');
  });

  it('skips test files', async () => {
    const moduleContent = `
      export const command = { name: 'hello', description: 'Say hello', options: [] };
      export async function execute() { return 'hello'; }
    `;
    await writeFile(join(testDir, 'hello.js'), moduleContent);
    await writeFile(join(testDir, 'hello.test.js'), moduleContent);
    await writeFile(join(testDir, 'hello.property.test.js'), moduleContent);

    const commands = await loadCommands(testDir);
    expect(commands).toHaveLength(1);
    expect(commands[0].command.name).toBe('hello');
  });

  it('skips invalid modules and continues loading', async () => {
    const validModule = `
      export const command = { name: 'valid', description: 'Valid command', options: [] };
      export async function execute() {}
    `;
    const invalidModule = `
      export const command = { name: '', description: 'Invalid', options: [] };
      export async function execute() {}
    `;
    await writeFile(join(testDir, 'valid.js'), validModule);
    await writeFile(join(testDir, 'invalid.js'), invalidModule);

    const commands = await loadCommands(testDir);
    expect(commands).toHaveLength(1);
    expect(commands[0].command.name).toBe('valid');
  });

  it('detects duplicate command names and keeps first', async () => {
    const module1 = `
      export const command = { name: 'dupe', description: 'First module', options: [] };
      export async function execute() { return 'first'; }
    `;
    const module2 = `
      export const command = { name: 'dupe', description: 'Second module', options: [] };
      export async function execute() { return 'second'; }
    `;
    // Files are sorted alphabetically by readdir, so aaa comes before zzz
    await writeFile(join(testDir, 'aaa.js'), module1);
    await writeFile(join(testDir, 'zzz.js'), module2);

    const commands = await loadCommands(testDir);
    expect(commands).toHaveLength(1);
    expect(commands[0].command.description).toBe('First module');
  });

  it('returns empty array for non-existent directory', async () => {
    const commands = await loadCommands('/nonexistent/path/that/should/not/exist');
    expect(commands).toEqual([]);
  });

  it('returns empty array for directory with no js files', async () => {
    await writeFile(join(testDir, 'readme.md'), '# Hello');
    const commands = await loadCommands(testDir);
    expect(commands).toEqual([]);
  });

  it('skips modules that throw on import', async () => {
    const brokenModule = `
      throw new Error('Module initialization failed');
    `;
    const validModule = `
      export const command = { name: 'works', description: 'Works fine', options: [] };
      export async function execute() {}
    `;
    await writeFile(join(testDir, 'broken.js'), brokenModule);
    await writeFile(join(testDir, 'works.js'), validModule);

    const commands = await loadCommands(testDir);
    expect(commands).toHaveLength(1);
    expect(commands[0].command.name).toBe('works');
  });
});

describe('buildHandlerMap', () => {
  it('creates a Map from command name to execute function', () => {
    const exec1 = async () => 'one';
    const exec2 = async () => 'two';
    const commands = [
      { command: { name: 'cmd1', description: 'First', options: [] }, execute: exec1 },
      { command: { name: 'cmd2', description: 'Second', options: [] }, execute: exec2 },
    ];

    const map = buildHandlerMap(commands);
    expect(map.size).toBe(2);
    expect(map.get('cmd1')).toBe(exec1);
    expect(map.get('cmd2')).toBe(exec2);
  });

  it('returns empty Map for empty input', () => {
    const map = buildHandlerMap([]);
    expect(map.size).toBe(0);
  });
});
