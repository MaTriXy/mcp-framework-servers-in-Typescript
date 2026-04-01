import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { z } from 'zod';
import { MCPTool, ElicitationFieldSchema } from '../../src/tools/BaseTool.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ElicitResult } from '@modelcontextprotocol/sdk/types.js';
import { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';

// Mock the Server class
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    createMessage: jest.fn(),
    elicitInput: jest.fn(),
  })),
}));

describe('Elicitation', () => {
  // Tool that exposes protected elicitation methods for testing
  class ElicitTestTool extends MCPTool {
    name = 'elicit_tool';
    description = 'A tool that uses elicitation';
    schema = z.object({
      action: z.string().describe('The action to perform'),
    });

    protected async execute(input: { action: string }): Promise<unknown> {
      return { action: input.action };
    }

    // Expose protected methods for testing
    public testElicit(
      message: string,
      schema: Record<string, ElicitationFieldSchema>,
      options?: RequestOptions,
    ) {
      return this.elicit(message, schema, options);
    }

    public testElicitUrl(
      message: string,
      url: string,
      elicitationId: string,
      options?: RequestOptions,
    ) {
      return this.elicitUrl(message, url, elicitationId, options);
    }
  }

  let tool: ElicitTestTool;
  let mockServer: jest.Mocked<Server>;

  beforeEach(() => {
    tool = new ElicitTestTool();
    mockServer = new Server(
      { name: 'test-server', version: '1.0.0' },
      { capabilities: {} },
    ) as jest.Mocked<Server>;
    mockServer.elicitInput = jest.fn();
  });

  describe('elicit() - Form Mode', () => {
    it('should throw when called without server', async () => {
      await expect(
        tool.testElicit('Enter your name', {
          name: { type: 'string', description: 'Your name' },
        }),
      ).rejects.toThrow(
        "Cannot elicit input: server not available in tool 'elicit_tool'.",
      );
    });

    it('should call server.elicitInput with correct form params', async () => {
      const mockResult: ElicitResult = {
        action: 'accept',
        content: { name: 'Alice' },
      };
      mockServer.elicitInput.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      const result = await tool.testElicit('Enter your name', {
        name: { type: 'string', description: 'Your name' },
      });

      expect(mockServer.elicitInput).toHaveBeenCalledWith(
        {
          mode: 'form',
          message: 'Enter your name',
          requestedSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Your name' },
            },
            required: ['name'],
          },
        },
        undefined,
      );
      expect(result).toEqual(mockResult);
    });

    it('should handle multiple fields with required/optional', async () => {
      const mockResult: ElicitResult = {
        action: 'accept',
        content: { name: 'Alice', email: 'alice@example.com', age: 30 },
      };
      mockServer.elicitInput.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      await tool.testElicit('Enter your details', {
        name: { type: 'string', description: 'Your name' },
        email: { type: 'string', description: 'Your email', format: 'email' },
        age: { type: 'number', description: 'Your age', minimum: 18, optional: true },
      });

      const callArgs = mockServer.elicitInput.mock.calls[0][0] as any;
      expect(callArgs.requestedSchema.required).toEqual(['name', 'email']);
      expect(callArgs.requestedSchema.properties.age).toEqual({
        type: 'number',
        description: 'Your age',
        minimum: 18,
      });
      // 'optional' flag should NOT be passed through to the JSON Schema
      expect(callArgs.requestedSchema.properties.age).not.toHaveProperty('optional');
    });

    it('should omit required array when all fields are optional', async () => {
      const mockResult: ElicitResult = { action: 'accept', content: {} };
      mockServer.elicitInput.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      await tool.testElicit('Optional info', {
        nickname: { type: 'string', description: 'Optional nickname', optional: true },
      });

      const callArgs = mockServer.elicitInput.mock.calls[0][0] as any;
      expect(callArgs.requestedSchema).not.toHaveProperty('required');
    });

    it('should handle user declining', async () => {
      const mockResult: ElicitResult = { action: 'decline' };
      mockServer.elicitInput.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      const result = await tool.testElicit('Enter name', {
        name: { type: 'string', description: 'Name' },
      });

      expect(result.action).toBe('decline');
      expect(result.content).toBeUndefined();
    });

    it('should handle user cancelling', async () => {
      const mockResult: ElicitResult = { action: 'cancel' };
      mockServer.elicitInput.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      const result = await tool.testElicit('Enter name', {
        name: { type: 'string', description: 'Name' },
      });

      expect(result.action).toBe('cancel');
    });

    it('should handle enum fields', async () => {
      const mockResult: ElicitResult = {
        action: 'accept',
        content: { color: 'red' },
      };
      mockServer.elicitInput.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      await tool.testElicit('Pick a color', {
        color: { type: 'string', description: 'Your color', enum: ['red', 'green', 'blue'] },
      });

      const callArgs = mockServer.elicitInput.mock.calls[0][0] as any;
      expect(callArgs.requestedSchema.properties.color).toEqual({
        type: 'string',
        description: 'Your color',
        enum: ['red', 'green', 'blue'],
      });
    });

    it('should handle oneOf enum fields', async () => {
      const mockResult: ElicitResult = {
        action: 'accept',
        content: { priority: 'high' },
      };
      mockServer.elicitInput.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      await tool.testElicit('Select priority', {
        priority: {
          type: 'string',
          description: 'Priority level',
          oneOf: [
            { const: 'low', title: 'Low Priority' },
            { const: 'medium', title: 'Medium Priority' },
            { const: 'high', title: 'High Priority' },
          ],
        },
      });

      const callArgs = mockServer.elicitInput.mock.calls[0][0] as any;
      expect(callArgs.requestedSchema.properties.priority.oneOf).toHaveLength(3);
    });

    it('should handle boolean fields', async () => {
      const mockResult: ElicitResult = {
        action: 'accept',
        content: { agree: true },
      };
      mockServer.elicitInput.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      await tool.testElicit('Terms', {
        agree: { type: 'boolean', description: 'Accept terms?', default: false },
      });

      const callArgs = mockServer.elicitInput.mock.calls[0][0] as any;
      expect(callArgs.requestedSchema.properties.agree).toEqual({
        type: 'boolean',
        description: 'Accept terms?',
        default: false,
      });
    });

    it('should handle array (multi-select) fields', async () => {
      const mockResult: ElicitResult = {
        action: 'accept',
        content: { tags: ['a', 'b'] },
      };
      mockServer.elicitInput.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      await tool.testElicit('Select tags', {
        tags: {
          type: 'array',
          description: 'Choose tags',
          minItems: 1,
          maxItems: 3,
          items: { type: 'string', enum: ['a', 'b', 'c', 'd'] },
        },
      });

      const callArgs = mockServer.elicitInput.mock.calls[0][0] as any;
      expect(callArgs.requestedSchema.properties.tags.items).toEqual({
        type: 'string',
        enum: ['a', 'b', 'c', 'd'],
      });
    });

    it('should pass request options', async () => {
      const mockResult: ElicitResult = { action: 'accept', content: { name: 'test' } };
      mockServer.elicitInput.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      const options: RequestOptions = {
        timeout: 30000,
        signal: new AbortController().signal,
      };

      await tool.testElicit('Enter name', {
        name: { type: 'string', description: 'Name' },
      }, options);

      expect(mockServer.elicitInput).toHaveBeenCalledWith(
        expect.any(Object),
        options,
      );
    });

    it('should propagate elicitInput errors', async () => {
      tool.injectServer(mockServer);
      mockServer.elicitInput.mockRejectedValue(
        new Error('Client does not support elicitation'),
      );

      await expect(
        tool.testElicit('Enter name', {
          name: { type: 'string', description: 'Name' },
        }),
      ).rejects.toThrow('Client does not support elicitation');
    });
  });

  describe('elicitUrl() - URL Mode', () => {
    it('should throw when called without server', async () => {
      await expect(
        tool.testElicitUrl(
          'Please authorize',
          'https://auth.example.com/authorize',
          'auth-123',
        ),
      ).rejects.toThrow(
        "Cannot elicit input: server not available in tool 'elicit_tool'.",
      );
    });

    it('should call server.elicitInput with correct URL params', async () => {
      const mockResult: ElicitResult = { action: 'accept' };
      mockServer.elicitInput.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      const result = await tool.testElicitUrl(
        'Please authorize access',
        'https://auth.example.com/authorize?state=xyz',
        'elicit-456',
      );

      expect(mockServer.elicitInput).toHaveBeenCalledWith(
        {
          mode: 'url',
          message: 'Please authorize access',
          url: 'https://auth.example.com/authorize?state=xyz',
          elicitationId: 'elicit-456',
        },
        undefined,
      );
      expect(result.action).toBe('accept');
    });

    it('should handle user declining URL', async () => {
      const mockResult: ElicitResult = { action: 'decline' };
      mockServer.elicitInput.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      const result = await tool.testElicitUrl(
        'Open link',
        'https://example.com',
        'id-1',
      );

      expect(result.action).toBe('decline');
    });

    it('should handle user cancelling URL', async () => {
      const mockResult: ElicitResult = { action: 'cancel' };
      mockServer.elicitInput.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      const result = await tool.testElicitUrl(
        'Open link',
        'https://example.com',
        'id-1',
      );

      expect(result.action).toBe('cancel');
    });

    it('should pass request options', async () => {
      const mockResult: ElicitResult = { action: 'accept' };
      mockServer.elicitInput.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      const options: RequestOptions = { timeout: 60000 };

      await tool.testElicitUrl(
        'Authorize',
        'https://auth.example.com',
        'id-2',
        options,
      );

      expect(mockServer.elicitInput).toHaveBeenCalledWith(
        expect.any(Object),
        options,
      );
    });

    it('should propagate elicitInput errors for URL mode', async () => {
      tool.injectServer(mockServer);
      mockServer.elicitInput.mockRejectedValue(
        new Error('Client does not support url elicitation'),
      );

      await expect(
        tool.testElicitUrl(
          'Authorize',
          'https://auth.example.com',
          'id-3',
        ),
      ).rejects.toThrow('Client does not support url elicitation');
    });
  });

  describe('Elicitation within execute()', () => {
    class InteractiveFormTool extends MCPTool {
      name = 'interactive_form_tool';
      description = 'A tool that elicits user input during execution';
      schema = z.object({
        task: z.string().describe('The task to perform'),
      });

      protected async execute(input: { task: string }): Promise<unknown> {
        const result = await this.elicit('Please provide your name to continue', {
          name: { type: 'string', description: 'Your full name' },
          confirm: { type: 'boolean', description: 'Confirm?', default: false },
        });

        if (result.action === 'accept') {
          return { task: input.task, userName: result.content?.name };
        }
        return { task: input.task, cancelled: true };
      }
    }

    class InteractiveUrlTool extends MCPTool {
      name = 'interactive_url_tool';
      description = 'A tool that uses URL elicitation during execution';
      schema = z.object({
        service: z.string().describe('The service to connect'),
      });

      protected async execute(input: { service: string }): Promise<unknown> {
        const result = await this.elicitUrl(
          `Please authorize ${input.service}`,
          `https://${input.service}.example.com/oauth`,
          `auth-${input.service}`,
        );

        if (result.action === 'accept') {
          return { service: input.service, authorized: true };
        }
        return { service: input.service, authorized: false };
      }
    }

    it('should use form elicitation during tool execution', async () => {
      const formTool = new InteractiveFormTool();
      mockServer.elicitInput.mockResolvedValue({
        action: 'accept',
        content: { name: 'Alice', confirm: true },
      });
      formTool.injectServer(mockServer);

      const response = await formTool.toolCall({
        params: { name: 'interactive_form_tool', arguments: { task: 'greet' } },
      });

      expect(response.content).toHaveLength(1);
      const result = JSON.parse((response.content[0] as any).text);
      expect(result).toEqual({ task: 'greet', userName: 'Alice' });
    });

    it('should handle declined form elicitation during execution', async () => {
      const formTool = new InteractiveFormTool();
      mockServer.elicitInput.mockResolvedValue({ action: 'decline' });
      formTool.injectServer(mockServer);

      const response = await formTool.toolCall({
        params: { name: 'interactive_form_tool', arguments: { task: 'greet' } },
      });

      const result = JSON.parse((response.content[0] as any).text);
      expect(result).toEqual({ task: 'greet', cancelled: true });
    });

    it('should use URL elicitation during tool execution', async () => {
      const urlTool = new InteractiveUrlTool();
      mockServer.elicitInput.mockResolvedValue({ action: 'accept' });
      urlTool.injectServer(mockServer);

      const response = await urlTool.toolCall({
        params: { name: 'interactive_url_tool', arguments: { service: 'github' } },
      });

      expect(mockServer.elicitInput).toHaveBeenCalledWith(
        {
          mode: 'url',
          message: 'Please authorize github',
          url: 'https://github.example.com/oauth',
          elicitationId: 'auth-github',
        },
        undefined,
      );
      const result = JSON.parse((response.content[0] as any).text);
      expect(result).toEqual({ service: 'github', authorized: true });
    });
  });
});
