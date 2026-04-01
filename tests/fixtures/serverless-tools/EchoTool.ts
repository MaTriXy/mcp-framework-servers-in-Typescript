import { z } from 'zod';
import { MCPTool } from '../../../src/tools/BaseTool.js';

const schema = z.object({
  message: z.string().describe('Message to echo back'),
});

export default class EchoTool extends MCPTool<typeof schema> {
  name = 'echo';
  description = 'Echoes the input message back';
  schema = schema;

  async execute(input: z.infer<typeof schema>) {
    return {
      content: [{ type: 'text' as const, text: input.message }],
    };
  }
}
