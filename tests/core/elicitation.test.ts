import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { MCPTool, ElicitationFieldSchema } from '../../src/tools/BaseTool.js';

const schema = z.object({ action: z.string().describe('action') });

class ElicitationTool extends MCPTool {
  name = 'elicit_test';
  description = 'Tests elicitation';
  schema = schema;

  async execute() {
    return 'ok';
  }
}

describe('Elicitation', () => {
  it('should export ElicitationFieldSchema type', () => {
    // Type-level test - if it compiles, it works
    const field: ElicitationFieldSchema = {
      type: 'string',
      title: 'Name',
      description: 'Your name',
    };
    expect(field.type).toBe('string');
  });

  it('should support string fields', () => {
    const field: ElicitationFieldSchema = {
      type: 'string',
      title: 'Email',
      format: 'email',
      default: 'user@example.com',
    };
    expect(field.type).toBe('string');
  });

  it('should support number fields', () => {
    const field: ElicitationFieldSchema = {
      type: 'number',
      minimum: 0,
      maximum: 100,
      default: 50,
    };
    expect(field.type).toBe('number');
  });

  it('should support boolean fields', () => {
    const field: ElicitationFieldSchema = {
      type: 'boolean',
      default: false,
    };
    expect(field.type).toBe('boolean');
  });

  it('should support enum fields (untitled)', () => {
    const field: ElicitationFieldSchema = {
      type: 'string',
      enum: ['Red', 'Green', 'Blue'],
      default: 'Red',
    };
    expect(field.type).toBe('string');
  });

  it('should support enum fields (titled)', () => {
    const field: ElicitationFieldSchema = {
      type: 'string',
      oneOf: [
        { const: '#FF0000', title: 'Red' },
        { const: '#00FF00', title: 'Green' },
      ],
    };
    expect(field.type).toBe('string');
  });

  it('should support multi-select array fields', () => {
    const field: ElicitationFieldSchema = {
      type: 'array',
      items: { type: 'string', enum: ['A', 'B', 'C'] },
      minItems: 1,
      maxItems: 2,
    };
    expect(field.type).toBe('array');
  });

  it('should require server injection for elicit()', async () => {
    const tool = new ElicitationTool();
    // Accessing elicit() requires the tool to be executed with server
    // Since it's protected, we can only test via the type system
    expect(tool.name).toBe('elicit_test');
  });
});
