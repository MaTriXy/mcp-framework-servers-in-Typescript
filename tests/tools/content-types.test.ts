import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import { MCPTool, AudioContent, ResourceLinkContent, EmbeddedResourceContent } from '../../src/tools/BaseTool.js';

// Mock the Server class
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    createMessage: jest.fn(),
  })),
}));

const schema = z.object({ type: z.string().describe('content type to return') });

class ContentTestTool extends MCPTool {
  name = 'content_test';
  description = 'Returns different content types';
  schema = schema;

  async execute(input: { type: string }) {
    switch (input.type) {
      case 'audio':
        return {
          type: 'audio' as const,
          data: 'base64audiodata',
          mimeType: 'audio/wav',
        };
      case 'resource_link':
        return {
          type: 'resource_link' as const,
          uri: 'file:///project/src/main.rs',
          name: 'main.rs',
          mimeType: 'text/x-rust',
        };
      case 'embedded':
        return {
          type: 'resource' as const,
          resource: {
            uri: 'file:///project/README.md',
            mimeType: 'text/markdown',
            text: '# Hello',
          },
        };
      case 'annotated_text':
        return [
          {
            type: 'text' as const,
            text: 'Hello',
            annotations: {
              audience: ['user' as const],
              priority: 0.9,
            },
          },
        ];
      default:
        return 'plain text';
    }
  }
}

describe('Content Types', () => {
  const tool = new ContentTestTool();

  it('should handle audio content', async () => {
    const result = await tool.toolCall({ params: { name: 'content_test', arguments: { type: 'audio' } } });
    expect(result.content[0]).toEqual({
      type: 'audio',
      data: 'base64audiodata',
      mimeType: 'audio/wav',
    });
  });

  it('should handle resource link content', async () => {
    const result = await tool.toolCall({ params: { name: 'content_test', arguments: { type: 'resource_link' } } });
    expect(result.content[0]).toMatchObject({
      type: 'resource_link',
      uri: 'file:///project/src/main.rs',
    });
  });

  it('should handle embedded resource content', async () => {
    const result = await tool.toolCall({ params: { name: 'content_test', arguments: { type: 'embedded' } } });
    expect(result.content[0]).toMatchObject({
      type: 'resource',
      resource: { uri: 'file:///project/README.md', text: '# Hello' },
    });
  });

  it('should handle text with annotations', async () => {
    const result = await tool.toolCall({ params: { name: 'content_test', arguments: { type: 'annotated_text' } } });
    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Hello',
      annotations: { audience: ['user'], priority: 0.9 },
    });
  });

  it('should handle plain text fallback', async () => {
    const result = await tool.toolCall({ params: { name: 'content_test', arguments: { type: 'plain' } } });
    expect(result.content[0]).toEqual({ type: 'text', text: '"plain text"' });
  });

  it('should handle mixed content array', async () => {
    class MixedTool extends MCPTool {
      name = 'mixed';
      description = 'Returns mixed content';
      schema = z.object({});
      async execute() {
        return [
          { type: 'text' as const, text: 'Hello' },
          { type: 'audio' as const, data: 'abc', mimeType: 'audio/wav' },
          { type: 'resource_link' as const, uri: 'file:///test' },
        ];
      }
    }
    const mixedTool = new MixedTool();
    const result = await mixedTool.toolCall({ params: { name: 'mixed', arguments: {} } });
    expect(result.content).toHaveLength(3);
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect(result.content[1]).toMatchObject({ type: 'audio' });
    expect(result.content[2]).toMatchObject({ type: 'resource_link' });
  });
});
