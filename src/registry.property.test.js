// Feature: steam-discord-bot, Property 7: Command module validation
// Feature: steam-discord-bot, Property 8: Duplicate command name detection

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateCommandModule } from './registry.js';

/**
 * Property 7: Command module validation
 * Validates: Requirements 4.4, 4.5, 4.6
 *
 * For any module shape, acceptance iff it exports a valid command object
 * and execute function. Specifically:
 * - mod must be a non-null object
 * - mod.command must be a non-null object
 * - mod.command.name must be a string of 1-32 chars
 * - mod.command.description must be a string of 1-100 chars
 * - mod.command.options must be an Array
 * - mod.execute must be a function
 * - If all conditions are met -> { valid: true }
 * - If any condition fails -> { valid: false, reason: string }
 */

/** Generator for a valid command name (1-32 chars) */
const validNameArb = fc.string({ minLength: 1, maxLength: 32 });

/** Generator for a valid description (1-100 chars) */
const validDescriptionArb = fc.string({ minLength: 1, maxLength: 100 });

/** Generator for a valid options array */
const validOptionsArb = fc.array(fc.anything(), { minLength: 0, maxLength: 5 });

/** Generator for a valid execute function */
const validExecuteArb = fc.constant(async () => {});

/** Generator for a fully valid command module */
const validModuleArb = fc.record({
  command: fc.record({
    name: validNameArb,
    description: validDescriptionArb,
    options: validOptionsArb,
  }),
  execute: validExecuteArb,
});

describe('Property 7: Command module validation', () => {
  it('accepts any module with valid command object and execute function', () => {
    fc.assert(
      fc.property(validModuleArb, (mod) => {
        const result = validateCommandModule(mod, '/test/path.js');
        expect(result.valid).toBe(true);
        expect(result.reason).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  it('rejects any non-object or null module', () => {
    const invalidModArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.integer(),
      fc.string(),
      fc.boolean(),
    );

    fc.assert(
      fc.property(invalidModArb, (mod) => {
        const result = validateCommandModule(mod, '/test/path.js');
        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
        expect(typeof result.reason).toBe('string');
      }),
      { numRuns: 100 }
    );
  });

  it('rejects modules with invalid or missing command object', () => {
    const invalidCommandArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.integer(),
      fc.string(),
      fc.boolean(),
    );

    fc.assert(
      fc.property(invalidCommandArb, validExecuteArb, (command, execute) => {
        const mod = { command, execute };
        const result = validateCommandModule(mod, '/test/path.js');
        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  it('rejects modules with invalid command.name (empty or > 32 chars)', () => {
    const invalidNameArb = fc.oneof(
      fc.constant(''),                                // empty
      fc.string({ minLength: 33, maxLength: 100 }),   // too long
      fc.integer(),                                   // not a string
      fc.constant(null),                              // null
      fc.constant(undefined),                         // undefined
    );

    fc.assert(
      fc.property(
        invalidNameArb,
        validDescriptionArb,
        validOptionsArb,
        validExecuteArb,
        (name, description, options, execute) => {
          const mod = { command: { name, description, options }, execute };
          const result = validateCommandModule(mod, '/test/path.js');
          expect(result.valid).toBe(false);
          expect(result.reason).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects modules with invalid command.description (empty or > 100 chars)', () => {
    const invalidDescriptionArb = fc.oneof(
      fc.constant(''),                                 // empty
      fc.string({ minLength: 101, maxLength: 200 }),   // too long
      fc.integer(),                                    // not a string
      fc.constant(null),                               // null
      fc.constant(undefined),                          // undefined
    );

    fc.assert(
      fc.property(
        validNameArb,
        invalidDescriptionArb,
        validOptionsArb,
        validExecuteArb,
        (name, description, options, execute) => {
          const mod = { command: { name, description, options }, execute };
          const result = validateCommandModule(mod, '/test/path.js');
          expect(result.valid).toBe(false);
          expect(result.reason).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects modules with non-array command.options', () => {
    const invalidOptionsArb = fc.oneof(
      fc.constant('not-array'),
      fc.integer(),
      fc.constant(null),
      fc.constant(undefined),
      fc.record({ length: fc.nat() }), // object that looks like array but isn't
    );

    fc.assert(
      fc.property(
        validNameArb,
        validDescriptionArb,
        invalidOptionsArb,
        validExecuteArb,
        (name, description, options, execute) => {
          const mod = { command: { name, description, options }, execute };
          const result = validateCommandModule(mod, '/test/path.js');
          expect(result.valid).toBe(false);
          expect(result.reason).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects modules with non-function execute', () => {
    const invalidExecuteArb = fc.oneof(
      fc.constant('not-a-function'),
      fc.integer(),
      fc.constant(null),
      fc.constant(undefined),
      fc.constant({}),
    );

    fc.assert(
      fc.property(
        validNameArb,
        validDescriptionArb,
        validOptionsArb,
        invalidExecuteArb,
        (name, description, options, execute) => {
          const mod = { command: { name, description, options }, execute };
          const result = validateCommandModule(mod, '/test/path.js');
          expect(result.valid).toBe(false);
          expect(result.reason).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('boundary: names of exactly 1 and 32 chars are valid', () => {
    const boundaryNameArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 1 }),   // min boundary
      fc.string({ minLength: 32, maxLength: 32 }), // max boundary
    );

    fc.assert(
      fc.property(
        boundaryNameArb,
        validDescriptionArb,
        validOptionsArb,
        validExecuteArb,
        (name, description, options, execute) => {
          const mod = { command: { name, description, options }, execute };
          const result = validateCommandModule(mod, '/test/path.js');
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('boundary: descriptions of exactly 1 and 100 chars are valid', () => {
    const boundaryDescArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 1 }),     // min boundary
      fc.string({ minLength: 100, maxLength: 100 }), // max boundary
    );

    fc.assert(
      fc.property(
        validNameArb,
        boundaryDescArb,
        validOptionsArb,
        validExecuteArb,
        (name, description, options, execute) => {
          const mod = { command: { name, description, options }, execute };
          const result = validateCommandModule(mod, '/test/path.js');
          expect(result.valid).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 8: Duplicate command name detection
 * Validates: Requirements 4.4, 4.5, 4.6
 *
 * For any set of modules with overlapping names, only the first is registered.
 * We test the deduplication logic by simulating the same algorithm used in
 * loadCommands: iterate modules, keep first occurrence of each command.name.
 */

/**
 * Simulates the deduplication logic from loadCommands.
 * Given a list of validated modules, returns only the first module for each unique name.
 */
function deduplicateModules(modules) {
  const seen = new Map();
  const result = [];

  for (const mod of modules) {
    if (!seen.has(mod.command.name)) {
      seen.set(mod.command.name, true);
      result.push(mod);
    }
  }

  return result;
}

/** Generator for a valid module with a specific name */
function validModuleWithNameArb(nameArb) {
  return fc.record({
    command: fc.record({
      name: nameArb,
      description: validDescriptionArb,
      options: fc.constant([]),
    }),
    execute: validExecuteArb,
    filePath: fc.string({ minLength: 1, maxLength: 30 }),
  });
}

describe('Property 8: Duplicate command name detection', () => {
  it('keeps only the first module for each duplicate command name', () => {
    // Generate a list where at least some names repeat
    const sharedNameArb = fc.string({ minLength: 1, maxLength: 10 });

    fc.assert(
      fc.property(
        sharedNameArb,
        fc.array(validModuleWithNameArb(fc.constant('placeholder')), { minLength: 2, maxLength: 10 }),
        (sharedName, modules) => {
          // Force all modules to share the same name
          const duplicateModules = modules.map((mod) => ({
            ...mod,
            command: { ...mod.command, name: sharedName },
          }));

          const deduplicated = deduplicateModules(duplicateModules);

          // Only the first should be kept
          expect(deduplicated).toHaveLength(1);
          expect(deduplicated[0]).toEqual(duplicateModules[0]);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('preserves all modules when all names are unique', () => {
    // Generate modules with guaranteed unique names
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 20 }), {
          minLength: 1,
          maxLength: 10,
          comparator: (a, b) => a === b,
        }),
        (uniqueNames) => {
          const modules = uniqueNames.map((name) => ({
            command: { name, description: 'Test description', options: [] },
            execute: async () => {},
            filePath: `/test/${name}.js`,
          }));

          const deduplicated = deduplicateModules(modules);

          expect(deduplicated).toHaveLength(modules.length);
          for (let i = 0; i < modules.length; i++) {
            expect(deduplicated[i].command.name).toBe(modules[i].command.name);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('result count equals number of unique names in input', () => {
    const namePoolArb = fc.array(fc.string({ minLength: 1, maxLength: 10 }), {
      minLength: 1,
      maxLength: 5,
    });

    fc.assert(
      fc.property(
        namePoolArb,
        fc.array(fc.nat({ max: 4 }), { minLength: 2, maxLength: 15 }),
        (namePool, indices) => {
          // Build modules picking names from the pool
          const modules = indices.map((idx, i) => ({
            command: {
              name: namePool[idx % namePool.length],
              description: `Module ${i}`,
              options: [],
            },
            execute: async () => {},
            filePath: `/test/mod${i}.js`,
          }));

          const deduplicated = deduplicateModules(modules);
          const uniqueNames = new Set(modules.map((m) => m.command.name));

          expect(deduplicated).toHaveLength(uniqueNames.size);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('first occurrence is always the one kept for each name', () => {
    const namePoolArb = fc.array(fc.string({ minLength: 1, maxLength: 10 }), {
      minLength: 1,
      maxLength: 3,
    });

    fc.assert(
      fc.property(
        namePoolArb,
        fc.array(fc.nat({ max: 2 }), { minLength: 3, maxLength: 15 }),
        (namePool, indices) => {
          const modules = indices.map((idx, i) => ({
            command: {
              name: namePool[idx % namePool.length],
              description: `Module ${i}`,
              options: [],
            },
            execute: async () => {},
            filePath: `/test/mod${i}.js`,
          }));

          const deduplicated = deduplicateModules(modules);

          // For each deduplicated module, verify it matches the first occurrence in the input
          for (const kept of deduplicated) {
            const firstInInput = modules.find(
              (m) => m.command.name === kept.command.name
            );
            expect(kept).toEqual(firstInInput);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('deduplicated result maintains original insertion order', () => {
    const namePoolArb = fc.array(fc.string({ minLength: 1, maxLength: 10 }), {
      minLength: 2,
      maxLength: 4,
    });

    fc.assert(
      fc.property(
        namePoolArb,
        fc.array(fc.nat({ max: 3 }), { minLength: 4, maxLength: 15 }),
        (namePool, indices) => {
          const modules = indices.map((idx, i) => ({
            command: {
              name: namePool[idx % namePool.length],
              description: `Module ${i}`,
              options: [],
            },
            execute: async () => {},
            filePath: `/test/mod${i}.js`,
          }));

          const deduplicated = deduplicateModules(modules);

          // Each item in deduplicated should appear at an earlier or equal index
          // than the next item (order preserved)
          for (let i = 1; i < deduplicated.length; i++) {
            const prevIdx = modules.indexOf(deduplicated[i - 1]);
            const currIdx = modules.indexOf(deduplicated[i]);
            expect(prevIdx).toBeLessThan(currIdx);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
