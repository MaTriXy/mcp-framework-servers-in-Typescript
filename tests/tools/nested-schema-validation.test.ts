import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { MCPTool } from '../../src/tools/BaseTool.js';

describe('Nested schema description validation', () => {
  it('should throw when nested object fields lack descriptions', () => {
    class NestedTool extends MCPTool {
      name = 'nested_tool';
      description = 'Tool with nested schema';
      schema = z.object({
        query: z.string().describe('Search query'),
        position: z.object({
          x: z.number(),  // Missing description!
          y: z.number(),  // Missing description!
        }).describe('Position object'),
      });

      async execute(input: any) {
        return input;
      }
    }

    const tool = new NestedTool();
    expect(() => tool.inputSchema).toThrow(/Missing descriptions/);
    expect(() => tool.inputSchema).toThrow(/position\.x/);
    expect(() => tool.inputSchema).toThrow(/position\.y/);
  });

  it('should pass when all nested fields have descriptions', () => {
    class GoodNestedTool extends MCPTool {
      name = 'good_nested_tool';
      description = 'Tool with proper nested schema';
      schema = z.object({
        query: z.string().describe('Search query'),
        position: z.object({
          x: z.number().describe('X coordinate'),
          y: z.number().describe('Y coordinate'),
        }).describe('Position object'),
      });

      async execute(input: any) {
        return input;
      }
    }

    const tool = new GoodNestedTool();
    const schema = tool.inputSchema;
    expect(schema.type).toBe('object');
    expect((schema.properties as any).position.properties.x.description).toBe('X coordinate');
    expect((schema.properties as any).position.properties.y.description).toBe('Y coordinate');
  });

  it('should validate deeply nested objects', () => {
    class DeepTool extends MCPTool {
      name = 'deep_tool';
      description = 'Tool with deeply nested schema';
      schema = z.object({
        config: z.object({
          nested: z.object({
            value: z.string(),  // Missing description!
          }).describe('Nested config'),
        }).describe('Config object'),
      });

      async execute(input: any) {
        return input;
      }
    }

    const tool = new DeepTool();
    expect(() => tool.inputSchema).toThrow(/Missing descriptions/);
    expect(() => tool.inputSchema).toThrow(/config\.nested\.value/);
  });

  it('should handle arrays with nested objects correctly', () => {
    class ArrayTool extends MCPTool {
      name = 'array_tool';
      description = 'Tool with array of objects';
      schema = z.object({
        items: z.array(z.object({
          name: z.string().describe('Item name'),
        })).describe('List of items'),
      });

      async execute(input: any) {
        return input;
      }
    }

    const tool = new ArrayTool();
    expect(() => tool.inputSchema).not.toThrow();
  });

  it('should handle optional nested objects', () => {
    class OptionalNestedTool extends MCPTool {
      name = 'optional_nested_tool';
      description = 'Tool with optional nested schema';
      schema = z.object({
        filter: z.object({
          field: z.string().describe('Field name'),
          value: z.string().describe('Field value'),
        }).optional().describe('Optional filter'),
      });

      async execute(input: any) {
        return input;
      }
    }

    const tool = new OptionalNestedTool();
    expect(() => tool.inputSchema).not.toThrow();
  });
});
