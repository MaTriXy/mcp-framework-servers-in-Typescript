import {
  AppProtocol,
  AppToolDefinition,
  AppCSPConfig,
  AppPermissionsConfig,
  AppUIResourceMeta,
  MCP_APP_MIME_TYPE,
} from './types.js';
import { validateAppUri, validateAppToolVisibility, warnContentSize } from './validation.js';
import { ResourceContent, ResourceDefinition } from '../resources/BaseResource.js';

/** UI configuration for an MCPApp. */
export interface AppUIConfig {
  /** URI for this app's UI resource. Must start with "ui://". */
  resourceUri: string;
  /** Human-readable name for the UI resource. */
  resourceName: string;
  /** Optional description of the UI. */
  resourceDescription?: string;
  /** CSP configuration for the iframe sandbox. */
  csp?: AppCSPConfig;
  /** Browser permissions needed by the app. */
  permissions?: AppPermissionsConfig;
  /** Whether the host should render a visible border. */
  prefersBorder?: boolean;
}

/**
 * Base class for standalone MCP Apps (Mode A).
 *
 * Bundles UI configuration, HTML content, and associated tool definitions
 * into a single auto-discoverable class. Place subclasses in `src/apps/`.
 *
 * @example
 * ```typescript
 * class DashboardApp extends MCPApp {
 *   name = "dashboard";
 *   ui = {
 *     resourceUri: "ui://dashboard/view",
 *     resourceName: "Dashboard",
 *   };
 *   getContent() { return readFileSync("./dashboard.html", "utf-8"); }
 *   tools = [{
 *     name: "show_dashboard",
 *     description: "Show the dashboard",
 *     schema: z.object({ range: z.string().describe("Time range") }),
 *     execute: async (input) => fetchData(input.range),
 *   }];
 * }
 * ```
 */
export abstract class MCPApp implements AppProtocol {
  /** Unique identifier for this app. */
  abstract name: string;
  /** UI configuration (resource URI, name, CSP, permissions). */
  abstract ui: AppUIConfig;
  /** Tools associated with this app. At least one is required. */
  abstract tools: AppToolDefinition[];
  /** Return the HTML content for the UI resource. */
  abstract getContent(): Promise<string> | string;

  /** Validates app configuration. Called by MCPServer at startup. */
  validate(): void {
    validateAppUri(this.ui.resourceUri, `app "${this.name}"`);

    if (!this.ui.resourceName) {
      throw new Error(`App "${this.name}" must have a ui.resourceName.`);
    }

    if (!this.tools || this.tools.length === 0) {
      throw new Error(`App "${this.name}" must define at least one tool.`);
    }

    const toolNames = new Set<string>();
    for (const tool of this.tools) {
      if (toolNames.has(tool.name)) {
        throw new Error(`App "${this.name}" has duplicate tool name: "${tool.name}".`);
      }
      toolNames.add(tool.name);

      if (!tool.name || !tool.description || !tool.schema || !tool.execute) {
        throw new Error(
          `App "${this.name}" tool "${tool.name || '(unnamed)'}" must have name, description, schema, and execute.`,
        );
      }

      validateAppToolVisibility(tool.visibility, tool.name);
    }
  }

  /** Returns the MCP resource definition for this app's UI. */
  get resourceDefinition(): ResourceDefinition {
    return {
      uri: this.ui.resourceUri,
      name: this.ui.resourceName,
      description: this.ui.resourceDescription,
      mimeType: MCP_APP_MIME_TYPE,
    };
  }

  /** Returns the _meta.ui metadata for resource content, or undefined if none. */
  get resourceMeta(): AppUIResourceMeta | undefined {
    const { csp, permissions, prefersBorder } = this.ui;
    if (!csp && !permissions && prefersBorder === undefined) return undefined;
    return {
      ...(csp && { csp }),
      ...(permissions && { permissions }),
      ...(prefersBorder !== undefined && { prefersBorder }),
    };
  }

  /** Reads HTML content and returns it as MCP ResourceContent. */
  async readResource(): Promise<ResourceContent[]> {
    const html = await this.getContent();
    warnContentSize(html, this.name);

    const content: ResourceContent & { _meta?: Record<string, unknown> } = {
      uri: this.ui.resourceUri,
      mimeType: MCP_APP_MIME_TYPE,
      text: html,
    };

    const meta = this.resourceMeta;
    if (meta) {
      content._meta = { ui: meta };
    }

    return [content];
  }

  /** Returns the _meta.ui object for a tool definition. */
  getToolMeta(toolName: string): { ui: { resourceUri: string; visibility?: Array<string> } } {
    const tool = this.tools.find((t) => t.name === toolName);
    const visibility = tool?.visibility ?? ['model', 'app'];
    return {
      ui: {
        resourceUri: this.ui.resourceUri,
        ...(visibility && { visibility }),
      },
    };
  }
}
