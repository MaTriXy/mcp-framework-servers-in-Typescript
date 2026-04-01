import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { MCPTool } from '../../src/tools/BaseTool.js';

describe('Schema validation error messages', () => {
  it('should throw a helpful error when schema is a plain object with raw Zod types', () => {
    class BadTool extends MCPTool<any> {
      name = 'bad_tool';
      description = 'A tool with incorrect schema';
      schema = {
        message: z.string(),
        count: z.number(),
      } as any;

      async execute(input: any) {
        return input;
      }
    }

    const tool = new BadTool();
    expect(() => tool.inputSchema).toThrow(/Invalid schema format/);
    expect(() => tool.inputSchema).toThrow(/Use z\.object\(\) instead/);
    expect(() => tool.inputSchema).toThrow(/bad_tool/);
  });

  it('should NOT throw for valid legacy format schemas', () => {
    class LegacyTool extends MCPTool<{ message: string }> {
      name = 'legacy_tool';
      description = 'A tool with legacy schema';
      schema = {
        message: {
          type: z.string(),
          description: 'A message',
        },
      };

      async execute(input: { message: string }) {
        return input;
      }
    }

    const tool = new LegacyTool();
    expect(() => tool.inputSchema).not.toThrow();
  });

  it('should NOT throw for valid Zod object schemas', () => {
    class ZodTool extends MCPTool {
      name = 'zod_tool';
      description = 'A tool with Zod schema';
      schema = z.object({
        message: z.string().describe('A message'),
      });

      async execute(input: any) {
        return input;
      }
    }

    const tool = new ZodTool();
    expect(() => tool.inputSchema).not.toThrow();
  });
});

describe('CLI templates use Zod-first pattern', () => {
  it('add-tool template should use z.object() pattern', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync('src/cli/project/add-tool.ts', 'utf-8');

    // Should use z.object pattern
    expect(content).toContain('z.object({');
    expect(content).toContain('.describe(');
    // Should import MCPInput
    expect(content).toContain('MCPInput');
    // Should NOT have legacy format with { type: z.string(), description: ... }
    expect(content).not.toMatch(/type:\s*z\.string\(\)/);
  });

  it('create template should use z.object() pattern', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync('src/cli/project/create.ts', 'utf-8');

    // Should use z.object pattern in example tools
    expect(content).toContain('z.object({');
    expect(content).toContain('.describe(');
    // Should NOT have legacy format
    expect(content).not.toMatch(/type:\s*z\.string\(\),\s*\n\s*description:/);
  });
});
