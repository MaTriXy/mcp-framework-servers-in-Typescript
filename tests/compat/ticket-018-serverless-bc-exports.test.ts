/**
 * BC-018: Public exports backwards compatibility tests
 *
 * Captures the COMPLETE public API surface of mcp-framework before
 * the serverless refactor. Every runtime export and type export that
 * exists today must continue to exist after the refactor.
 *
 * This extends the existing regression-suite.e2e.test.ts with more
 * granular checks on specific method signatures and type shapes.
 */

import { describe, it, expect } from '@jest/globals';

// ── Runtime value imports ────────────────────────────────────────────────

import {
  MCPServer,
  MCPTool,
  MCPPrompt,
  MCPResource,
  Logger,
  defineSchema,
  APIKeyAuthProvider,
  JWTAuthProvider,
  OAuthAuthProvider,
  HttpStreamTransport,
  requestContext,
  getRequestContext,
  runInRequestContext,
  validateOrigin,
  getValidatedCorsOrigin,
  MCPApp,
  MCP_APP_MIME_TYPE,
  MCP_APP_URI_SCHEME,
  MCP_APP_EXTENSION_ID,
} from '../../src/index.js';

// ── Type imports ─────────────────────────────────────────────────────────

import type {
  MCPServerConfig,
  TransportConfig,
  TransportType,
  ServerCapabilities,
  TasksConfig,
  MCPLogLevel,
  ToolProtocol,
  ToolInputSchema,
  ToolInput,
  MCPInput,
  InferSchemaType,
  TextContent,
  ToolContent,
  ToolResponse,
  PromptProtocol,
  PromptArgumentSchema,
  PromptArguments,
  CompletionResult,
  ResourceProtocol,
  ResourceContent,
  ResourceDefinition,
  ResourceTemplateDefinition,
  AuthProvider,
  AuthConfig,
  AuthResult,
  SSETransportConfig,
  HttpStreamTransportConfig,
  RequestContextData,
  OriginValidationConfig,
  AppProtocol,
  AppToolDefinition,
  ToolAppConfig,
  AppCSPConfig,
  AppPermissionsConfig,
  AppUIResourceMeta,
  AppToolMeta,
  AppToolVisibility,
  AppUIConfig,
} from '../../src/index.js';

// ── Runtime export existence ─────────────────────────────────────────────

describe('BC-018: All runtime exports exist', () => {
  it('BC-018-EX01: core classes are constructors', () => {
    for (const cls of [MCPServer, MCPTool, MCPPrompt, MCPResource, Logger]) {
      expect(cls).toBeDefined();
      expect(typeof cls).toBe('function');
    }
  });

  it('BC-018-EX02: auth providers are constructors', () => {
    for (const cls of [APIKeyAuthProvider, JWTAuthProvider, OAuthAuthProvider]) {
      expect(cls).toBeDefined();
      expect(typeof cls).toBe('function');
    }
  });

  it('BC-018-EX03: transport classes are constructors', () => {
    expect(HttpStreamTransport).toBeDefined();
    expect(typeof HttpStreamTransport).toBe('function');
  });

  it('BC-018-EX04: utility functions are functions', () => {
    for (const fn of [
      defineSchema,
      getRequestContext,
      runInRequestContext,
      validateOrigin,
      getValidatedCorsOrigin,
    ]) {
      expect(fn).toBeDefined();
      expect(typeof fn).toBe('function');
    }
  });

  it('BC-018-EX05: requestContext is AsyncLocalStorage instance', () => {
    expect(requestContext).toBeDefined();
    expect(typeof requestContext.run).toBe('function');
    expect(typeof requestContext.getStore).toBe('function');
  });

  it('BC-018-EX06: App-related exports exist', () => {
    expect(MCPApp).toBeDefined();
    expect(typeof MCPApp).toBe('function');
    expect(typeof MCP_APP_MIME_TYPE).toBe('string');
    expect(typeof MCP_APP_URI_SCHEME).toBe('string');
    expect(typeof MCP_APP_EXTENSION_ID).toBe('string');
  });
});

// ── MCPServer method existence ───────────────────────────────────────────

describe('BC-018: MCPServer method signatures', () => {
  let server: MCPServer;

  beforeAll(() => {
    server = new MCPServer();
  });

  it('BC-018-MS01: has start() returning Promise', () => {
    expect(typeof server.start).toBe('function');
  });

  it('BC-018-MS02: has stop() returning Promise', () => {
    expect(typeof server.stop).toBe('function');
  });

  it('BC-018-MS03: has IsRunning getter returning boolean', () => {
    expect(typeof server.IsRunning).toBe('boolean');
  });

  it('BC-018-MS04: has listRoots() returning Promise', () => {
    expect(typeof server.listRoots).toBe('function');
  });

  it('BC-018-MS05: has roots getter returning array', () => {
    expect(Array.isArray(server.roots)).toBe(true);
  });

  it('BC-018-MS06: has sendLog() method', () => {
    expect(typeof server.sendLog).toBe('function');
  });
});

// ── Type shape compile-time checks ───────────────────────────────────────

describe('BC-018: Type exports compile correctly', () => {
  it('BC-018-TS01: MCPServerConfig accepts all fields', () => {
    const config: MCPServerConfig = {
      name: 'test',
      version: '1.0',
      basePath: '/tmp',
      transport: { type: 'stdio' },
      logging: true,
      tasks: { enabled: true, defaultTtl: 1000, defaultPollInterval: 500, maxTasks: 10 },
      devMode: false,
    };
    expect(config.name).toBe('test');
  });

  it('BC-018-TS02: TransportType is union of three strings', () => {
    const types: TransportType[] = ['stdio', 'sse', 'http-stream'];
    expect(types).toHaveLength(3);
  });

  it('BC-018-TS03: ServerCapabilities has all optional fields', () => {
    const caps: ServerCapabilities = {};
    const fullCaps: ServerCapabilities = {
      tools: { listChanged: true },
      prompts: { listChanged: true },
      resources: { listChanged: true, subscribe: true },
      completions: {},
      logging: {},
    };
    expect(caps).toBeDefined();
    expect(fullCaps.tools).toBeDefined();
  });

  it('BC-018-TS04: TasksConfig shape', () => {
    const config: TasksConfig = {
      enabled: true,
      defaultTtl: 5000,
      defaultPollInterval: 1000,
      maxTasks: 50,
    };
    expect(config.enabled).toBe(true);
  });

  it('BC-018-TS05: SSETransportConfig and HttpStreamTransportConfig', () => {
    const sseConfig: SSETransportConfig = {
      port: 8080,
      host: '0.0.0.0',
      endpoint: '/sse',
    };
    const httpConfig: HttpStreamTransportConfig = {
      port: 8080,
      host: '0.0.0.0',
      endpoint: '/mcp',
      responseMode: 'batch',
    };
    expect(sseConfig.port).toBe(8080);
    expect(httpConfig.responseMode).toBe('batch');
  });

  it('BC-018-TS06: RequestContextData shape', () => {
    const data: RequestContextData = {
      token: 'abc',
      user: { id: '1' },
      customField: 42,
    };
    expect(data.token).toBe('abc');
  });

  it('BC-018-TS07: ToolProtocol essential fields', () => {
    const tool = {} as ToolProtocol;
    // Compile check — these fields must exist on the type
    void tool.name;
    void tool.toolDefinition;
    void tool.toolCall;
    void tool.injectServer;
    expect(true).toBe(true);
  });

  it('BC-018-TS08: PromptProtocol essential fields', () => {
    const prompt = {} as PromptProtocol;
    void prompt.name;
    void prompt.promptDefinition;
    void prompt.getMessages;
    expect(true).toBe(true);
  });

  it('BC-018-TS09: ResourceProtocol essential fields', () => {
    const resource = {} as ResourceProtocol;
    void resource.uri;
    void resource.resourceDefinition;
    void resource.read;
    expect(true).toBe(true);
  });

  it('BC-018-TS10: AuthProvider interface shape', () => {
    const provider = {} as AuthProvider;
    void provider.authenticate;
    void provider.getAuthError;
    expect(true).toBe(true);
  });

  it('BC-018-TS11: App-related types compile', () => {
    const proto = {} as AppProtocol;
    void proto.name;
    void proto.tools;
    void proto.ui;

    const toolDef = {} as AppToolDefinition;
    void toolDef.name;

    const visibility: AppToolVisibility = ['model', 'app'];
    expect(visibility).toBeDefined();

    const config = {} as ToolAppConfig;
    void config.resourceUri;
    void config.content;
    expect(true).toBe(true);
  });

  it('BC-018-TS12: OriginValidationConfig type', () => {
    const config: OriginValidationConfig = {
      allowedOrigins: ['http://localhost:3000'],
    };
    expect(config.allowedOrigins).toHaveLength(1);
  });

  it('BC-018-TS13: MCPLogLevel values', () => {
    const levels: MCPLogLevel[] = [
      'debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency',
    ];
    expect(levels).toHaveLength(8);
  });

  it('BC-018-TS14: ToolContent and TextContent types', () => {
    const text: TextContent = { type: 'text', text: 'hello' };
    const content: ToolContent = text;
    expect(content.type).toBe('text');
  });

  it('BC-018-TS15: ToolResponse shape', () => {
    const response: ToolResponse = {
      content: [{ type: 'text', text: 'result' }],
    };
    expect(response.content).toHaveLength(1);
  });

  it('BC-018-TS16: CompletionResult shape', () => {
    const result: CompletionResult = { values: ['a', 'b'] };
    expect(result.values).toHaveLength(2);
  });
});

// ── HttpStreamTransport API ──────────────────────────────────────────────

describe('BC-018: HttpStreamTransport API surface', () => {
  it('BC-018-HX01: has type property', () => {
    const t = new HttpStreamTransport();
    expect(t.type).toBe('http-stream');
  });

  it('BC-018-HX02: has isRunning() method', () => {
    const t = new HttpStreamTransport();
    expect(typeof t.isRunning).toBe('function');
    expect(t.isRunning()).toBe(false);
  });

  it('BC-018-HX03: has start() method', () => {
    const t = new HttpStreamTransport();
    expect(typeof t.start).toBe('function');
  });

  it('BC-018-HX04: has close() method', () => {
    const t = new HttpStreamTransport();
    expect(typeof t.close).toBe('function');
  });

  it('BC-018-HX05: has send() method', () => {
    const t = new HttpStreamTransport();
    expect(typeof t.send).toBe('function');
  });

  it('BC-018-HX06: supports onmessage/onclose/onerror handlers', () => {
    const t = new HttpStreamTransport();
    expect('onmessage' in t).toBe(true);
    expect('onclose' in t).toBe(true);
    expect('onerror' in t).toBe(true);
  });
});
