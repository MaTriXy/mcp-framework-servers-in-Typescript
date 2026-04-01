import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { z } from 'zod';
import { MCPTool, Root } from '../../src/tools/BaseTool.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js';

// Mock the Server class
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    createMessage: jest.fn(),
    elicitInput: jest.fn(),
    listRoots: jest.fn(),
  })),
}));

describe('Roots Support', () => {
  // Tool that exposes the protected getRoots method for testing
  class RootsTestTool extends MCPTool {
    name = 'roots_tool';
    description = 'A tool that uses roots';
    schema = z.object({
      path: z.string().describe('File path'),
    });

    protected async execute(input: { path: string }): Promise<unknown> {
      return { path: input.path };
    }

    // Expose protected method for testing
    public testGetRoots(options?: RequestOptions) {
      return this.getRoots(options);
    }
  }

  let tool: RootsTestTool;
  let mockServer: jest.Mocked<Server>;

  beforeEach(() => {
    tool = new RootsTestTool();
    mockServer = new Server(
      { name: 'test-server', version: '1.0.0' },
      { capabilities: {} },
    ) as jest.Mocked<Server>;
    (mockServer as any).listRoots = jest.fn<any>();
  });

  describe('getRoots() on tool', () => {
    it('should throw when called without server injection', async () => {
      await expect(tool.testGetRoots()).rejects.toThrow(
        "Cannot get roots: server not available in tool 'roots_tool'.",
      );
    });

    it('should return roots from server.listRoots()', async () => {
      const mockRoots = {
        roots: [
          { uri: 'file:///home/user/project', name: 'My Project' },
          { uri: 'file:///home/user/docs' },
        ],
      };
      (mockServer as any).listRoots.mockResolvedValue(mockRoots);
      tool.injectServer(mockServer);

      const roots = await tool.testGetRoots();

      expect(roots).toEqual([
        { uri: 'file:///home/user/project', name: 'My Project' },
        { uri: 'file:///home/user/docs', name: undefined },
      ]);
    });

    it('should return empty array when listRoots fails', async () => {
      (mockServer as any).listRoots.mockRejectedValue(new Error('Client does not support roots'));
      tool.injectServer(mockServer);

      const roots = await tool.testGetRoots();

      expect(roots).toEqual([]);
    });

    it('should return empty array when listRoots returns empty roots', async () => {
      (mockServer as any).listRoots.mockResolvedValue({ roots: [] });
      tool.injectServer(mockServer);

      const roots = await tool.testGetRoots();

      expect(roots).toEqual([]);
    });

    it('should pass request options to server.listRoots', async () => {
      (mockServer as any).listRoots.mockResolvedValue({ roots: [] });
      tool.injectServer(mockServer);

      const options: RequestOptions = { timeout: 5000 };
      await tool.testGetRoots(options);

      expect((mockServer as any).listRoots).toHaveBeenCalledWith(undefined, options);
    });
  });

  describe('Root type', () => {
    it('should define uri and optional name', () => {
      const root: Root = { uri: 'file:///home/user' };
      expect(root.uri).toBe('file:///home/user');
      expect(root.name).toBeUndefined();
    });

    it('should allow name to be set', () => {
      const root: Root = { uri: 'file:///home/user', name: 'Home' };
      expect(root.uri).toBe('file:///home/user');
      expect(root.name).toBe('Home');
    });
  });

  describe('Roots within execute()', () => {
    class FileReaderTool extends MCPTool {
      name = 'file_reader';
      description = 'Reads files, checking roots first';
      schema = z.object({
        path: z.string().describe('File path to read'),
      });

      protected async execute(input: { path: string }): Promise<unknown> {
        const roots = await this.getRoots();
        const isAllowed = roots.some((r) => input.path.startsWith(r.uri));
        if (!isAllowed && roots.length > 0) {
          return { error: 'Path not within allowed roots' };
        }
        return { path: input.path, rootCount: roots.length };
      }
    }

    it('should use getRoots during tool execution', async () => {
      const fileTool = new FileReaderTool();
      (mockServer as any).listRoots.mockResolvedValue({
        roots: [
          { uri: 'file:///home/user/project', name: 'Project' },
        ],
      });
      fileTool.injectServer(mockServer);

      const response = await fileTool.toolCall({
        params: { name: 'file_reader', arguments: { path: 'file:///home/user/project/src/main.ts' } },
      });

      const result = JSON.parse((response.content[0] as any).text);
      expect(result.path).toBe('file:///home/user/project/src/main.ts');
      expect(result.rootCount).toBe(1);
    });

    it('should reject paths outside roots', async () => {
      const fileTool = new FileReaderTool();
      (mockServer as any).listRoots.mockResolvedValue({
        roots: [
          { uri: 'file:///home/user/project', name: 'Project' },
        ],
      });
      fileTool.injectServer(mockServer);

      const response = await fileTool.toolCall({
        params: { name: 'file_reader', arguments: { path: 'file:///etc/passwd' } },
      });

      const result = JSON.parse((response.content[0] as any).text);
      expect(result.error).toBe('Path not within allowed roots');
    });
  });
});
