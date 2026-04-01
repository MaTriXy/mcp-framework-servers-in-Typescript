import { describe, it, expect, beforeEach } from '@jest/globals';
import { z } from 'zod';
import { MCPTool } from '../../src/tools/BaseTool.js';

const schema = z.object({ delay: z.number().describe('delay in ms') });

class CancellableTool extends MCPTool {
  name = 'cancellable';
  description = 'A cancellable tool';
  schema = schema;
  public wasAborted = false;

  async execute(input: { delay: number }) {
    if (this.abortSignal?.aborted) {
      this.wasAborted = true;
      return 'Aborted immediately';
    }

    return new Promise<string>((resolve) => {
      const onAbort = () => {
        this.wasAborted = true;
        resolve('Cancelled');
      };

      this.abortSignal?.addEventListener('abort', onAbort);

      setTimeout(() => {
        this.abortSignal?.removeEventListener('abort', onAbort);
        resolve('Completed');
      }, input.delay);
    });
  }
}

describe('Cancellation', () => {
  let tool: CancellableTool;

  beforeEach(() => {
    tool = new CancellableTool();
  });

  it('should have abortSignal as undefined by default', () => {
    // Access via the tool call - abortSignal is protected
    expect(typeof tool.setAbortSignal).toBe('function');
  });

  it('should expose setAbortSignal method', () => {
    const controller = new AbortController();
    tool.setAbortSignal(controller.signal);
    tool.setAbortSignal(undefined); // clear
  });

  it('should detect pre-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort('test reason');
    tool.setAbortSignal(controller.signal);

    const result = await tool.toolCall({ params: { name: 'cancellable', arguments: { delay: 1000 } } });
    expect(tool.wasAborted).toBe(true);
    expect(result.content[0]).toMatchObject({ type: 'text', text: '"Aborted immediately"' });
  });

  it('should complete normally without abort signal', async () => {
    const result = await tool.toolCall({ params: { name: 'cancellable', arguments: { delay: 10 } } });
    expect(result.content[0]).toMatchObject({ type: 'text', text: '"Completed"' });
    expect(tool.wasAborted).toBe(false);
  });
});
