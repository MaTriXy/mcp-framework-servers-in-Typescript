import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import { MCPTool } from '../../src/tools/BaseTool.js';

// Mock the Server class
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    createMessage: jest.fn(),
  })),
}));

const inputSchema = z.object({ city: z.string().describe('City name') });
const outputSchema = z.object({
  temperature: z.number().describe('Temp in celsius'),
  conditions: z.string().describe('Weather conditions'),
});

class StructuredTool extends MCPTool {
  name = 'weather';
  description = 'Get weather';
  schema = inputSchema;
  outputSchemaShape = outputSchema;

  async execute(input: { city: string }) {
    return { temperature: 22.5, conditions: 'Sunny' };
  }
}

class StructuredToolBadOutput extends MCPTool {
  name = 'bad_weather';
  description = 'Get weather with bad output';
  schema = inputSchema;
  outputSchemaShape = outputSchema;

  async execute() {
    return { wrong: 'field' };
  }
}

class UnstructuredTool extends MCPTool {
  name = 'simple';
  description = 'Simple tool';
  schema = inputSchema;

  async execute() {
    return 'hello';
  }
}

describe('Structured Content', () => {
  describe('outputSchema in definition', () => {
    it('should include outputSchema when defined', () => {
      const tool = new StructuredTool();
      const def = tool.toolDefinition;
      expect(def.outputSchema).toBeDefined();
      expect((def.outputSchema as any).type).toBe('object');
      expect((def.outputSchema as any).properties.temperature).toBeDefined();
      expect((def.outputSchema as any).properties.conditions).toBeDefined();
    });

    it('should not include outputSchema when not defined', () => {
      const tool = new UnstructuredTool();
      expect('outputSchema' in tool.toolDefinition).toBe(false);
    });
  });

  describe('structuredContent in response', () => {
    it('should include structuredContent when output matches schema', async () => {
      const tool = new StructuredTool();
      const result = await tool.toolCall({ params: { name: 'weather', arguments: { city: 'NYC' } } });
      expect(result.structuredContent).toEqual({ temperature: 22.5, conditions: 'Sunny' });
      // Also has text content for backwards compat
      expect(result.content[0]).toMatchObject({ type: 'text' });
    });

    it('should fall back gracefully when output does not match schema', async () => {
      const tool = new StructuredToolBadOutput();
      const result = await tool.toolCall({ params: { name: 'bad_weather', arguments: { city: 'NYC' } } });
      // Should NOT have structuredContent since validation failed
      expect(result.structuredContent).toBeUndefined();
      // But should still return as text content
      expect(result.content[0]).toMatchObject({ type: 'text' });
    });

    it('should not include structuredContent for unstructured tools', async () => {
      const tool = new UnstructuredTool();
      const result = await tool.toolCall({ params: { name: 'simple', arguments: { city: 'NYC' } } });
      expect(result.structuredContent).toBeUndefined();
    });
  });
});
