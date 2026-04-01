import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import { MCPTool } from '../../src/tools/BaseTool.js';

// Mock the Server class
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    createMessage: jest.fn(),
  })),
}));

const schema = z.object({ input: z.string().describe('test') });

class ToolWithAnnotations extends MCPTool {
  name = 'annotated_tool';
  description = 'An annotated tool';
  annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  schema = schema;
  async execute() { return 'ok'; }
}

class ToolPartialAnnotations extends MCPTool {
  name = 'partial_tool';
  description = 'Partially annotated';
  annotations = { readOnlyHint: true };
  schema = schema;
  async execute() { return 'ok'; }
}

class ToolNoAnnotations extends MCPTool {
  name = 'plain_tool';
  description = 'No annotations';
  schema = schema;
  async execute() { return 'ok'; }
}

class ToolEmptyAnnotations extends MCPTool {
  name = 'empty_ann_tool';
  description = 'Empty annotations';
  annotations = {};
  schema = schema;
  async execute() { return 'ok'; }
}

describe('Tool Annotations', () => {
  it('should include all annotations in definition when set', () => {
    const tool = new ToolWithAnnotations();
    const def = tool.toolDefinition;
    expect(def.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it('should include partial annotations', () => {
    const tool = new ToolPartialAnnotations();
    expect(tool.toolDefinition.annotations).toEqual({ readOnlyHint: true });
  });

  it('should not include annotations key when not set', () => {
    const tool = new ToolNoAnnotations();
    expect('annotations' in tool.toolDefinition).toBe(false);
  });

  it('should not include annotations key when empty object', () => {
    const tool = new ToolEmptyAnnotations();
    expect('annotations' in tool.toolDefinition).toBe(false);
  });

  it('should not affect tool execution', async () => {
    const tool = new ToolWithAnnotations();
    const result = await tool.toolCall({ params: { name: 'annotated_tool', arguments: { input: 'test' } } });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]).toEqual({ type: 'text', text: '"ok"' });
  });
});
