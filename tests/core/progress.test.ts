import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { z } from 'zod';
import { MCPTool } from '../../src/tools/BaseTool.js';

const schema = z.object({ count: z.number().describe('iterations') });

class ProgressTool extends MCPTool {
  name = 'progress_tool';
  description = 'Reports progress';
  schema = schema;

  async execute(input: { count: number }) {
    for (let i = 0; i < input.count; i++) {
      await this.reportProgress(i + 1, input.count, `Step ${i + 1}`);
    }
    return `Done after ${input.count} steps`;
  }
}

describe('Progress Tracking', () => {
  let tool: ProgressTool;

  beforeEach(() => {
    tool = new ProgressTool();
  });

  it('should be a no-op when no progress token is set', async () => {
    // No progress token set, no server injected - should not throw
    const result = await tool.toolCall({ params: { name: 'progress_tool', arguments: { count: 3 } } });
    expect(result.isError).toBeFalsy();
  });

  it('should expose setProgressToken method', () => {
    expect(typeof tool.setProgressToken).toBe('function');
  });

  it('should accept and clear progress tokens', () => {
    tool.setProgressToken('token-123');
    tool.setProgressToken(undefined); // clear
    // No error means it worked
  });

  it('should accept numeric progress tokens', () => {
    tool.setProgressToken(42);
    tool.setProgressToken(undefined);
  });
});
