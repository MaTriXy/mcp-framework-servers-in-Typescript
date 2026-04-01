/**
 * BaseTool.injectServer parity tests (Issue #124)
 *
 * The multi-transport plan changes injectServer() to allow re-injection
 * (removing the early-return guard). These tests verify:
 *
 * 1. Existing behavior: first injection works correctly
 * 2. New behavior: re-injection updates the server reference
 * 3. Sampling/progress/roots/logging all route to the CURRENT server
 * 4. No regressions in tool execution after re-injection
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { z } from 'zod';
import { MCPTool } from '../../src/tools/BaseTool.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';

// Mock the Server class
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    createMessage: jest.fn(),
    elicitInput: jest.fn(),
    listRoots: jest.fn(),
    notification: jest.fn(),
    sendLoggingMessage: jest.fn(),
  })),
}));

// ─── Test tool that exposes protected methods ────────────────────────

class InjectTestTool extends MCPTool {
  name = 'inject_test_tool';
  description = 'Tool for testing server injection';
  schema = z.object({
    value: z.string().describe('A test value'),
  });

  protected async execute(input: { value: string }): Promise<unknown> {
    return { echo: input.value };
  }

  // Expose protected methods for testing
  public testSamplingRequest(request: any, options?: RequestOptions) {
    return this.samplingRequest(request, options);
  }

  public testReportProgress(progress: number, total?: number, message?: string) {
    return this.reportProgress(progress, total, message);
  }

  public testGetRoots(options?: RequestOptions) {
    return this.getRoots(options);
  }

  public testLog(level: any, data: unknown, loggerName?: string) {
    return this.log(level, data, loggerName);
  }
}

function createMockServer(): jest.Mocked<Server> {
  const server = new Server(
    { name: 'test-server', version: '1.0.0' },
    { capabilities: {} },
  ) as jest.Mocked<Server>;
  (server as any).createMessage = jest.fn<any>();
  (server as any).elicitInput = jest.fn<any>();
  (server as any).listRoots = jest.fn<any>();
  (server as any).notification = jest.fn<any>();
  (server as any).sendLoggingMessage = jest.fn<any>();
  return server;
}

describe('BaseTool.injectServer parity', () => {
  let tool: InjectTestTool;
  let serverA: jest.Mocked<Server>;
  let serverB: jest.Mocked<Server>;

  beforeEach(() => {
    tool = new InjectTestTool();
    serverA = createMockServer();
    serverB = createMockServer();
  });

  // ─── Basic injection ──────────────────────────────────────────────

  describe('Initial injection', () => {
    it('should accept first server injection', () => {
      tool.injectServer(serverA);
      // No error means injection succeeded
      expect(true).toBe(true);
    });

    it('should enable sampling after injection', async () => {
      const mockResult = {
        model: 'test-model',
        role: 'assistant',
        content: { type: 'text', text: 'Hello' },
      };
      (serverA as any).createMessage.mockResolvedValue(mockResult);
      tool.injectServer(serverA);

      const result = await tool.testSamplingRequest({
        messages: [{ role: 'user', content: { type: 'text', text: 'Hi' } }],
        maxTokens: 100,
      });

      expect(result.model).toBe('test-model');
      expect((serverA as any).createMessage).toHaveBeenCalled();
    });

    it('should enable progress reporting after injection', async () => {
      (serverA as any).notification.mockResolvedValue(undefined);
      tool.injectServer(serverA);
      tool.setProgressToken('token-1');

      await tool.testReportProgress(1, 10, 'Step 1');

      expect((serverA as any).notification).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'notifications/progress',
          params: expect.objectContaining({
            progressToken: 'token-1',
            progress: 1,
            total: 10,
            message: 'Step 1',
          }),
        }),
      );
    });

    it('should enable roots listing after injection', async () => {
      (serverA as any).listRoots.mockResolvedValue({
        roots: [{ uri: 'file:///project', name: 'Project' }],
      });
      tool.injectServer(serverA);

      const roots = await tool.testGetRoots();

      expect(roots).toEqual([{ uri: 'file:///project', name: 'Project' }]);
      expect((serverA as any).listRoots).toHaveBeenCalled();
    });

    it('should enable logging after injection', async () => {
      (serverA as any).sendLoggingMessage.mockResolvedValue(undefined);
      tool.injectServer(serverA);

      await tool.testLog('info', 'test message');

      expect((serverA as any).sendLoggingMessage).toHaveBeenCalledWith({
        level: 'info',
        logger: 'inject_test_tool',
        data: 'test message',
      });
    });
  });

  // ─── Re-injection (new behavior for multi-transport) ───────────────

  describe('Re-injection routes to new server', () => {
    it('should allow re-injection without error', () => {
      tool.injectServer(serverA);
      tool.injectServer(serverB);
      // No error means re-injection succeeded
      expect(true).toBe(true);
    });

    it('sampling should route to the latest injected server', async () => {
      const mockResultA = { model: 'model-A', role: 'assistant', content: { type: 'text', text: 'A' } };
      const mockResultB = { model: 'model-B', role: 'assistant', content: { type: 'text', text: 'B' } };
      (serverA as any).createMessage.mockResolvedValue(mockResultA);
      (serverB as any).createMessage.mockResolvedValue(mockResultB);

      // Inject A, then B
      tool.injectServer(serverA);
      tool.injectServer(serverB);

      const result = await tool.testSamplingRequest({
        messages: [{ role: 'user', content: { type: 'text', text: 'Hi' } }],
        maxTokens: 100,
      });

      // Should use server B (latest injection)
      expect(result.model).toBe('model-B');
      expect((serverB as any).createMessage).toHaveBeenCalled();
      expect((serverA as any).createMessage).not.toHaveBeenCalled();
    });

    it('progress should route to the latest injected server', async () => {
      (serverA as any).notification.mockResolvedValue(undefined);
      (serverB as any).notification.mockResolvedValue(undefined);

      tool.injectServer(serverA);
      tool.injectServer(serverB);
      tool.setProgressToken('token-2');

      await tool.testReportProgress(5, 10, 'Step 5');

      expect((serverB as any).notification).toHaveBeenCalled();
      expect((serverA as any).notification).not.toHaveBeenCalled();
    });

    it('roots should route to the latest injected server', async () => {
      (serverA as any).listRoots.mockResolvedValue({
        roots: [{ uri: 'file:///a' }],
      });
      (serverB as any).listRoots.mockResolvedValue({
        roots: [{ uri: 'file:///b' }],
      });

      tool.injectServer(serverA);
      tool.injectServer(serverB);

      const roots = await tool.testGetRoots();

      expect(roots).toEqual([{ uri: 'file:///b', name: undefined }]);
      expect((serverB as any).listRoots).toHaveBeenCalled();
      expect((serverA as any).listRoots).not.toHaveBeenCalled();
    });

    it('logging should route to the latest injected server', async () => {
      (serverA as any).sendLoggingMessage.mockResolvedValue(undefined);
      (serverB as any).sendLoggingMessage.mockResolvedValue(undefined);

      tool.injectServer(serverA);
      tool.injectServer(serverB);

      await tool.testLog('warning', 'something happened');

      expect((serverB as any).sendLoggingMessage).toHaveBeenCalled();
      expect((serverA as any).sendLoggingMessage).not.toHaveBeenCalled();
    });
  });

  // ─── Tool execution still works after re-injection ────────────────

  describe('Tool execution after re-injection', () => {
    it('toolCall should succeed after server re-injection', async () => {
      tool.injectServer(serverA);
      tool.injectServer(serverB);

      const result = await tool.toolCall({
        params: { name: 'inject_test_tool', arguments: { value: 'hello' } },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as any).text);
      expect(parsed.echo).toBe('hello');
    });

    it('toolCall should succeed without any injection', async () => {
      // Tools should still work without a server (sampling will fail,
      // but basic execution should not)
      const result = await tool.toolCall({
        params: { name: 'inject_test_tool', arguments: { value: 'no-server' } },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as any).text);
      expect(parsed.echo).toBe('no-server');
    });

    it('toolCall preserves input validation after re-injection', async () => {
      tool.injectServer(serverA);
      tool.injectServer(serverB);

      // Missing required field should fail validation
      const result = await tool.toolCall({
        params: { name: 'inject_test_tool', arguments: {} },
      });

      expect(result.isError).toBe(true);
    });
  });

  // ─── Without server (pre-injection) ────────────────────────────────

  describe('Without server injection', () => {
    it('sampling should throw before injection', async () => {
      await expect(
        tool.testSamplingRequest({
          messages: [{ role: 'user', content: { type: 'text', text: 'Hi' } }],
          maxTokens: 100,
        }),
      ).rejects.toThrow(/server not available/);
    });

    it('progress should be no-op before injection', async () => {
      tool.setProgressToken('token-3');
      // Should not throw
      await tool.testReportProgress(1, 10);
    });

    it('roots should throw before injection', async () => {
      await expect(tool.testGetRoots()).rejects.toThrow(/server not available/);
    });

    it('logging should be no-op before injection', async () => {
      // Should not throw
      await tool.testLog('info', 'test');
    });
  });

  // ─── setProgressToken / setAbortSignal unaffected ──────────────────

  describe('setProgressToken and setAbortSignal unaffected by re-injection', () => {
    it('setProgressToken works before and after re-injection', () => {
      tool.setProgressToken('token-before');
      tool.injectServer(serverA);
      tool.setProgressToken('token-after-a');
      tool.injectServer(serverB);
      tool.setProgressToken('token-after-b');
      tool.setProgressToken(undefined);
      // No errors
      expect(true).toBe(true);
    });

    it('setAbortSignal works before and after re-injection', () => {
      const controller = new AbortController();
      tool.setAbortSignal(controller.signal);
      tool.injectServer(serverA);
      tool.setAbortSignal(controller.signal);
      tool.injectServer(serverB);
      tool.setAbortSignal(undefined);
      // No errors
      expect(true).toBe(true);
    });
  });
});
