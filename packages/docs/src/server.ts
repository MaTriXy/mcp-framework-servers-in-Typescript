import { MCPServer, MCPTool } from 'mcp-framework';
import type { TransportConfig } from 'mcp-framework';
import type { DocSource } from './sources/types.js';
import { SearchDocsTool } from './tools/SearchDocsTool.js';
import { GetPageTool } from './tools/GetPageTool.js';
import { ListSectionsTool } from './tools/ListSectionsTool.js';

export interface DocsServerConfig {
  /** Documentation source to serve */
  source: DocSource;
  /** Server name shown to MCP clients */
  name: string;
  /** Server version */
  version: string;
  /** Transport configuration (default: stdio) */
  transport?: TransportConfig;
  /** Override default tools — set tool name to false to disable, or provide custom tool instances */
  tools?: {
    search_docs?: boolean;
    get_page?: boolean;
    list_sections?: boolean;
    custom?: MCPTool[];
  };
}

/**
 * A convenience wrapper that creates an MCP server with documentation tools
 * auto-registered against a given DocSource.
 *
 * Uses the MCP SDK directly to avoid MCPServer's file-based auto-loading,
 * while keeping the same protocol behavior.
 */
export class DocsServer {
  private _source: DocSource;
  private _tools: MCPTool[] = [];
  private sdkServer: any;
  private _name: string;
  private _version: string;
  private transportConfig: TransportConfig;

  constructor(config: DocsServerConfig) {
    this._source = config.source;
    this._name = config.name;
    this._version = config.version;
    this.transportConfig = config.transport ?? { type: 'stdio' };

    const toolConfig = config.tools ?? {};

    if (toolConfig.search_docs !== false) {
      this._tools.push(new SearchDocsTool(this._source));
    }
    if (toolConfig.get_page !== false) {
      this._tools.push(new GetPageTool(this._source));
    }
    if (toolConfig.list_sections !== false) {
      this._tools.push(new ListSectionsTool(this._source));
    }
    if (toolConfig.custom) {
      this._tools.push(...toolConfig.custom);
    }
  }

  /** The documentation source backing this server */
  get source(): DocSource {
    return this._source;
  }

  /** The registered tools */
  get tools(): MCPTool[] {
    return this._tools;
  }

  /** Start the server */
  async start(): Promise<void> {
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    const {
      CallToolRequestSchema,
      ListToolsRequestSchema,
    } = await import('@modelcontextprotocol/sdk/types.js');

    this.sdkServer = new Server(
      { name: this._name, version: this._version },
      { capabilities: { tools: {} } }
    );

    const toolsMap = new Map(this._tools.map(t => [t.name, t]));

    this.sdkServer.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this._tools.map(t => t.toolDefinition),
    }));

    this.sdkServer.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const tool = toolsMap.get(request.params.name);
      if (!tool) {
        throw new Error(
          `Unknown tool: ${request.params.name}. Available: ${Array.from(toolsMap.keys()).join(', ')}`
        );
      }
      return tool.toolCall(request);
    });

    const { StdioServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/stdio.js'
    );
    const transport = new StdioServerTransport();
    await this.sdkServer.connect(transport);

    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        this.sdkServer.close().then(resolve);
      });
      process.on('SIGTERM', () => {
        this.sdkServer.close().then(resolve);
      });
    });
  }

  /** Stop the server */
  async stop(): Promise<void> {
    if (this.sdkServer) {
      await this.sdkServer.close();
    }
  }
}
