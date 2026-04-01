import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { MCPTool, ElicitationFieldSchema, ElicitResult } from '../../src/tools/BaseTool.js';

// Runtime import smoke test — verify all elicitation types are importable
import type {
  ElicitRequestFormParams,
  ElicitRequestURLParams,
} from '../../src/tools/BaseTool.js';

/**
 * E2E tests for the elicitation feature.
 *
 * These tests verify the full round-trip of elicitation within tool execution,
 * using a real MCPTool subclass with an injected mock server. They cover the
 * user-facing API surface: schema construction, optional/required handling,
 * all three response actions, and integration within the tool execute() lifecycle.
 */
describe('E2E: Elicitation', () => {
  // Reusable mock server factory
  function createMockServer(elicitResponse: ElicitResult) {
    return {
      createMessage: async () => ({ model: 'test', role: 'assistant' as const, content: { type: 'text' as const, text: '' } }),
      elicitInput: async () => elicitResponse,
      // Minimal Server shape — we only need elicitInput for these tests
    } as any;
  }

  describe('Form mode end-to-end', () => {
    class UserRegistrationTool extends MCPTool {
      name = 'register_user';
      description = 'Register a new user with elicitation';
      schema = z.object({
        role: z.string().describe('The role to assign'),
      });

      protected async execute(input: { role: string }): Promise<unknown> {
        const result = await this.elicit('Please provide your registration details', {
          name: { type: 'string', description: 'Full name', minLength: 2, maxLength: 100 },
          email: { type: 'string', description: 'Email address', format: 'email' },
          age: { type: 'integer', description: 'Age in years', minimum: 18, maximum: 120, optional: true },
          department: {
            type: 'string',
            description: 'Department',
            oneOf: [
              { const: 'eng', title: 'Engineering' },
              { const: 'sales', title: 'Sales' },
              { const: 'ops', title: 'Operations' },
            ],
          },
          notifications: { type: 'boolean', description: 'Enable notifications?', default: true },
        });

        if (result.action === 'accept' && result.content) {
          return {
            registered: true,
            role: input.role,
            name: result.content.name,
            email: result.content.email,
            age: result.content.age,
            department: result.content.department,
            notifications: result.content.notifications,
          };
        }

        return { registered: false, reason: result.action };
      }
    }

    it('should complete full registration flow with accepted elicitation', async () => {
      const tool = new UserRegistrationTool();
      const server = createMockServer({
        action: 'accept',
        content: {
          name: 'Alice Smith',
          email: 'alice@example.com',
          age: 30,
          department: 'eng',
          notifications: true,
        },
      });
      tool.injectServer(server);

      const response = await tool.toolCall({
        params: { name: 'register_user', arguments: { role: 'admin' } },
      });

      expect(response.isError).toBeUndefined();
      const result = JSON.parse((response.content[0] as any).text);
      expect(result).toEqual({
        registered: true,
        role: 'admin',
        name: 'Alice Smith',
        email: 'alice@example.com',
        age: 30,
        department: 'eng',
        notifications: true,
      });
    });

    it('should handle declined registration', async () => {
      const tool = new UserRegistrationTool();
      const server = createMockServer({ action: 'decline' });
      tool.injectServer(server);

      const response = await tool.toolCall({
        params: { name: 'register_user', arguments: { role: 'viewer' } },
      });

      const result = JSON.parse((response.content[0] as any).text);
      expect(result).toEqual({ registered: false, reason: 'decline' });
    });

    it('should handle cancelled registration', async () => {
      const tool = new UserRegistrationTool();
      const server = createMockServer({ action: 'cancel' });
      tool.injectServer(server);

      const response = await tool.toolCall({
        params: { name: 'register_user', arguments: { role: 'viewer' } },
      });

      const result = JSON.parse((response.content[0] as any).text);
      expect(result).toEqual({ registered: false, reason: 'cancel' });
    });

    it('should handle server error during elicitation gracefully', async () => {
      const tool = new UserRegistrationTool();
      const server = {
        createMessage: async () => ({ model: 'test', role: 'assistant' as const, content: { type: 'text' as const, text: '' } }),
        elicitInput: async () => { throw new Error('Client does not support elicitation'); },
      } as any;
      tool.injectServer(server);

      const response = await tool.toolCall({
        params: { name: 'register_user', arguments: { role: 'admin' } },
      });

      // toolCall catches errors and returns error response
      expect(response.isError).toBe(true);
      expect((response.content[0] as any).text).toContain('Client does not support elicitation');
    });
  });

  describe('URL mode end-to-end', () => {
    class OAuthConnectTool extends MCPTool {
      name = 'oauth_connect';
      description = 'Connect to a third-party service via OAuth';
      schema = z.object({
        provider: z.string().describe('OAuth provider name'),
      });

      protected async execute(input: { provider: string }): Promise<unknown> {
        const elicitationId = `oauth-${input.provider}-${Date.now()}`;
        const result = await this.elicitUrl(
          `Please authorize access to your ${input.provider} account`,
          `https://${input.provider}.example.com/oauth/authorize?elicitation_id=${elicitationId}`,
          elicitationId,
        );

        if (result.action === 'accept') {
          return { provider: input.provider, status: 'authorization_started' };
        }
        return { provider: input.provider, status: 'authorization_rejected', reason: result.action };
      }
    }

    it('should complete OAuth flow with accepted URL elicitation', async () => {
      const tool = new OAuthConnectTool();
      const server = createMockServer({ action: 'accept' });
      tool.injectServer(server);

      const response = await tool.toolCall({
        params: { name: 'oauth_connect', arguments: { provider: 'github' } },
      });

      const result = JSON.parse((response.content[0] as any).text);
      expect(result.provider).toBe('github');
      expect(result.status).toBe('authorization_started');
    });

    it('should handle user declining OAuth URL', async () => {
      const tool = new OAuthConnectTool();
      const server = createMockServer({ action: 'decline' });
      tool.injectServer(server);

      const response = await tool.toolCall({
        params: { name: 'oauth_connect', arguments: { provider: 'slack' } },
      });

      const result = JSON.parse((response.content[0] as any).text);
      expect(result).toEqual({
        provider: 'slack',
        status: 'authorization_rejected',
        reason: 'decline',
      });
    });
  });

  describe('Mixed elicitation (form + URL in one tool)', () => {
    class SetupWizardTool extends MCPTool {
      name = 'setup_wizard';
      description = 'Multi-step setup that uses both form and URL elicitation';
      schema = z.object({
        step: z.string().describe('Which step to run'),
      });

      protected async execute(input: { step: string }): Promise<unknown> {
        // Step 1: Form elicitation for basic info
        const formResult = await this.elicit('Enter your project details', {
          projectName: { type: 'string', description: 'Project name', minLength: 1 },
          language: {
            type: 'string',
            description: 'Programming language',
            enum: ['typescript', 'python', 'go'],
          },
        });

        if (formResult.action !== 'accept') {
          return { step: 'form', aborted: true };
        }

        // Step 2: URL elicitation for API key setup
        const urlResult = await this.elicitUrl(
          'Set up your API key securely',
          'https://dashboard.example.com/api-keys/new',
          `setup-${formResult.content?.projectName}`,
        );

        if (urlResult.action !== 'accept') {
          return { step: 'url', aborted: true, projectName: formResult.content?.projectName };
        }

        return {
          step: 'complete',
          projectName: formResult.content?.projectName,
          language: formResult.content?.language,
        };
      }
    }

    it('should complete full multi-step wizard', async () => {
      const tool = new SetupWizardTool();
      let callCount = 0;
      const server = {
        createMessage: async () => ({ model: 'test', role: 'assistant' as const, content: { type: 'text' as const, text: '' } }),
        elicitInput: async () => {
          callCount++;
          if (callCount === 1) {
            // Form response
            return { action: 'accept', content: { projectName: 'my-app', language: 'typescript' } };
          }
          // URL response
          return { action: 'accept' };
        },
      } as any;
      tool.injectServer(server);

      const response = await tool.toolCall({
        params: { name: 'setup_wizard', arguments: { step: 'start' } },
      });

      const result = JSON.parse((response.content[0] as any).text);
      expect(result).toEqual({
        step: 'complete',
        projectName: 'my-app',
        language: 'typescript',
      });
    });

    it('should abort at form step', async () => {
      const tool = new SetupWizardTool();
      const server = createMockServer({ action: 'decline' });
      tool.injectServer(server);

      const response = await tool.toolCall({
        params: { name: 'setup_wizard', arguments: { step: 'start' } },
      });

      const result = JSON.parse((response.content[0] as any).text);
      expect(result).toEqual({ step: 'form', aborted: true });
    });

    it('should abort at URL step after successful form', async () => {
      const tool = new SetupWizardTool();
      let callCount = 0;
      const server = {
        createMessage: async () => ({ model: 'test', role: 'assistant' as const, content: { type: 'text' as const, text: '' } }),
        elicitInput: async () => {
          callCount++;
          if (callCount === 1) {
            return { action: 'accept', content: { projectName: 'test-proj', language: 'go' } };
          }
          return { action: 'cancel' };
        },
      } as any;
      tool.injectServer(server);

      const response = await tool.toolCall({
        params: { name: 'setup_wizard', arguments: { step: 'start' } },
      });

      const result = JSON.parse((response.content[0] as any).text);
      expect(result).toEqual({ step: 'url', aborted: true, projectName: 'test-proj' });
    });
  });

  describe('Export verification', () => {
    it('should export ElicitationFieldSchema type correctly', () => {
      // Compile-time type check: ensure ElicitationFieldSchema supports all field types
      const stringField: ElicitationFieldSchema = { type: 'string', description: 'test' };
      const numberField: ElicitationFieldSchema = { type: 'number', description: 'test', minimum: 0 };
      const intField: ElicitationFieldSchema = { type: 'integer', description: 'test' };
      const boolField: ElicitationFieldSchema = { type: 'boolean', description: 'test', default: false };
      const enumField: ElicitationFieldSchema = { type: 'string', description: 'test', enum: ['a', 'b'] };
      const oneOfField: ElicitationFieldSchema = {
        type: 'string',
        description: 'test',
        oneOf: [{ const: 'a', title: 'A' }],
      };
      const arrayField: ElicitationFieldSchema = {
        type: 'array',
        description: 'test',
        items: { type: 'string', enum: ['x', 'y'] },
      };

      // Runtime check: all are valid objects
      expect(stringField.type).toBe('string');
      expect(numberField.type).toBe('number');
      expect(intField.type).toBe('integer');
      expect(boolField.type).toBe('boolean');
      expect(enumField.type).toBe('string');
      expect(oneOfField.type).toBe('string');
      expect(arrayField.type).toBe('array');
    });

    it('should export ElicitResult type from SDK', () => {
      // Verify ElicitResult re-export works
      const result: ElicitResult = { action: 'accept', content: { key: 'value' } };
      expect(result.action).toBe('accept');
    });
  });
});
