import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { z } from 'zod';
import { MCPTool, SamplingTool, SamplingToolChoice } from '../../src/tools/BaseTool.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CreateMessageResultWithTools } from '@modelcontextprotocol/sdk/types.js';
import { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';

// Mock the Server class
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    createMessage: jest.fn(),
    elicitInput: jest.fn(),
    listRoots: jest.fn(),
  })),
}));

describe('Sampling with Tools', () => {
  // Tool that exposes the protected samplingRequestWithTools method for testing
  class SamplingToolTestTool extends MCPTool {
    name = 'sampling_tool_test';
    description = 'A tool that uses sampling with tools';
    schema = z.object({
      query: z.string().describe('The query'),
    });

    protected async execute(input: { query: string }): Promise<unknown> {
      return { query: input.query };
    }

    // Expose protected methods for testing
    public testSamplingRequestWithTools(
      request: any,
      options?: RequestOptions,
    ) {
      return this.samplingRequestWithTools(request, options);
    }

    public testSamplingRequest(
      request: any,
      options?: RequestOptions,
    ) {
      return this.samplingRequest(request, options);
    }
  }

  let tool: SamplingToolTestTool;
  let mockServer: jest.Mocked<Server>;

  beforeEach(() => {
    tool = new SamplingToolTestTool();
    mockServer = new Server(
      { name: 'test-server', version: '1.0.0' },
      { capabilities: {} },
    ) as jest.Mocked<Server>;
    (mockServer as any).createMessage = jest.fn<any>();
  });

  describe('SamplingTool type', () => {
    it('should define name and inputSchema', () => {
      const samplingTool: SamplingTool = {
        name: 'get_weather',
        description: 'Get weather for a location',
        inputSchema: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
          required: ['city'],
        },
      };

      expect(samplingTool.name).toBe('get_weather');
      expect(samplingTool.inputSchema.type).toBe('object');
      expect(samplingTool.inputSchema.properties).toBeDefined();
    });

    it('should allow optional description', () => {
      const samplingTool: SamplingTool = {
        name: 'calculator',
        inputSchema: {
          type: 'object',
          properties: { expression: { type: 'string' } },
        },
      };
      expect(samplingTool.description).toBeUndefined();
    });
  });

  describe('SamplingToolChoice type', () => {
    it('should allow auto mode', () => {
      const choice: SamplingToolChoice = { mode: 'auto' };
      expect(choice.mode).toBe('auto');
    });

    it('should allow required mode', () => {
      const choice: SamplingToolChoice = { mode: 'required' };
      expect(choice.mode).toBe('required');
    });

    it('should allow none mode', () => {
      const choice: SamplingToolChoice = { mode: 'none' };
      expect(choice.mode).toBe('none');
    });

    it('should allow omitting mode', () => {
      const choice: SamplingToolChoice = {};
      expect(choice.mode).toBeUndefined();
    });
  });

  describe('samplingRequestWithTools()', () => {
    it('should throw when called without server injection', async () => {
      await expect(
        tool.testSamplingRequestWithTools({
          messages: [{ role: 'user', content: { type: 'text', text: 'Hello' } }],
          maxTokens: 100,
          tools: [{
            name: 'test_tool',
            inputSchema: { type: 'object' },
          }],
        }),
      ).rejects.toThrow(
        "Cannot make sampling request: server not available in tool 'sampling_tool_test'.",
      );
    });

    it('should call server.createMessage with tools', async () => {
      const mockResult = {
        model: 'test-model',
        role: 'assistant',
        content: { type: 'text', text: 'Here is the weather' },
      };
      (mockServer as any).createMessage.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      const tools: SamplingTool[] = [{
        name: 'get_weather',
        description: 'Get weather',
        inputSchema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      }];

      const result = await tool.testSamplingRequestWithTools({
        messages: [{ role: 'user', content: { type: 'text', text: 'What is the weather in NYC?' } }],
        maxTokens: 500,
        tools,
        toolChoice: { mode: 'auto' },
      });

      expect((mockServer as any).createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.any(Array),
          maxTokens: 500,
          tools,
          toolChoice: { mode: 'auto' },
        }),
        undefined,
      );
      expect(result.model).toBe('test-model');
    });

    it('should handle tool_use content in response', async () => {
      const mockResult = {
        model: 'test-model',
        role: 'assistant',
        stopReason: 'toolUse',
        content: {
          type: 'tool_use',
          name: 'get_weather',
          id: 'call_123',
          input: { city: 'NYC' },
        },
      };
      (mockServer as any).createMessage.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      const result = await tool.testSamplingRequestWithTools({
        messages: [{ role: 'user', content: { type: 'text', text: 'Weather in NYC?' } }],
        maxTokens: 500,
        tools: [{
          name: 'get_weather',
          inputSchema: { type: 'object', properties: { city: { type: 'string' } } },
        }],
      });

      expect(result.stopReason).toBe('toolUse');
      // The content should contain the tool_use block
      const content = result.content as any;
      expect(content.type).toBe('tool_use');
      expect(content.name).toBe('get_weather');
      expect(content.input).toEqual({ city: 'NYC' });
    });

    it('should pass request options', async () => {
      const mockResult = {
        model: 'test-model',
        role: 'assistant',
        content: { type: 'text', text: 'Done' },
      };
      (mockServer as any).createMessage.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      const options: RequestOptions = { timeout: 30000 };

      await tool.testSamplingRequestWithTools(
        {
          messages: [{ role: 'user', content: { type: 'text', text: 'Test' } }],
          maxTokens: 100,
          tools: [{
            name: 'noop',
            inputSchema: { type: 'object' },
          }],
        },
        options,
      );

      expect((mockServer as any).createMessage).toHaveBeenCalledWith(
        expect.any(Object),
        options,
      );
    });

    it('should propagate server errors', async () => {
      (mockServer as any).createMessage.mockRejectedValue(
        new Error('Client does not support sampling'),
      );
      tool.injectServer(mockServer);

      await expect(
        tool.testSamplingRequestWithTools({
          messages: [{ role: 'user', content: { type: 'text', text: 'Hi' } }],
          maxTokens: 100,
          tools: [{
            name: 'test',
            inputSchema: { type: 'object' },
          }],
        }),
      ).rejects.toThrow('Client does not support sampling');
    });
  });

  describe('samplingRequest() without tools (backwards compatibility)', () => {
    it('should still work without tools parameter', async () => {
      const mockResult = {
        model: 'test-model',
        role: 'assistant',
        content: { type: 'text', text: 'Hello!' },
      };
      (mockServer as any).createMessage.mockResolvedValue(mockResult);
      tool.injectServer(mockServer);

      const result = await tool.testSamplingRequest({
        messages: [{ role: 'user', content: { type: 'text', text: 'Hi' } }],
        maxTokens: 100,
      });

      expect(result.model).toBe('test-model');
      expect((mockServer as any).createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.any(Array),
          maxTokens: 100,
        }),
        undefined,
      );
    });
  });

  describe('Sampling with tools within execute()', () => {
    class AgenticTool extends MCPTool {
      name = 'agentic_tool';
      description = 'A tool that uses sampling with sub-tools';
      schema = z.object({
        question: z.string().describe('Question to answer'),
      });

      protected async execute(input: { question: string }): Promise<unknown> {
        const result = await this.samplingRequestWithTools({
          messages: [
            { role: 'user' as const, content: { type: 'text' as const, text: input.question } },
          ],
          maxTokens: 1000,
          tools: [{
            name: 'search',
            description: 'Search the web',
            inputSchema: {
              type: 'object' as const,
              properties: { query: { type: 'string' } },
              required: ['query'],
            },
          }],
          toolChoice: { mode: 'auto' as const },
        });

        return {
          answer: (result.content as any).text ?? 'Tool was used',
          model: result.model,
        };
      }
    }

    it('should use samplingRequestWithTools during tool execution', async () => {
      const agenticTool = new AgenticTool();
      (mockServer as any).createMessage.mockResolvedValue({
        model: 'claude-3',
        role: 'assistant',
        content: { type: 'text', text: 'The answer is 42' },
      });
      agenticTool.injectServer(mockServer);

      const response = await agenticTool.toolCall({
        params: { name: 'agentic_tool', arguments: { question: 'What is the meaning of life?' } },
      });

      expect(response.content).toHaveLength(1);
      const result = JSON.parse((response.content[0] as any).text);
      expect(result.answer).toBe('The answer is 42');
      expect(result.model).toBe('claude-3');

      // Verify tools were passed
      expect((mockServer as any).createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'search' }),
          ]),
          toolChoice: { mode: 'auto' },
        }),
        undefined,
      );
    });
  });
});
