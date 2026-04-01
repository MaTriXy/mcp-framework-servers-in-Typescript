import type { z } from 'zod';
import type { ResourceDefinition, ResourceContent } from '../resources/BaseResource.js';

// ── Constants ────────────────────────────────────────────────────────────────

/** MIME type for MCP App HTML resources. */
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

/** Required URI scheme for MCP App resources. */
export const MCP_APP_URI_SCHEME = 'ui://';

/** MCP extension identifier for UI support. */
export const MCP_APP_EXTENSION_ID = 'io.modelcontextprotocol/ui';

/** Recommended maximum HTML content size in bytes (512KB). */
export const MCP_APP_MAX_RECOMMENDED_SIZE = 512 * 1024;

// ── CSP & Permissions ────────────────────────────────────────────────────────

/** Content Security Policy configuration for an app's iframe sandbox. */
export interface AppCSPConfig {
  /** Origins for network requests (fetch/XHR/WebSocket). Maps to CSP connect-src. */
  connectDomains?: string[];
  /** Origins for static resources (scripts, images, styles, fonts). */
  resourceDomains?: string[];
  /** Origins for nested iframes. Maps to CSP frame-src. */
  frameDomains?: string[];
  /** Allowed base URIs for the document. Maps to CSP base-uri. */
  baseUriDomains?: string[];
}

/** Browser permissions the app may request from the host. */
export interface AppPermissionsConfig {
  camera?: {};
  microphone?: {};
  geolocation?: {};
  clipboardWrite?: {};
}

// ── Resource Metadata ────────────────────────────────────────────────────────

/** Metadata included in the resources/read response _meta.ui field. */
export interface AppUIResourceMeta {
  csp?: AppCSPConfig;
  permissions?: AppPermissionsConfig;
  domain?: string;
  prefersBorder?: boolean;
}

// ── Tool Visibility ──────────────────────────────────────────────────────────

/** Controls who can see/call a tool: the model (LLM), the app (iframe), or both. */
export type AppToolVisibility = Array<'model' | 'app'>;

/** UI metadata attached to a tool definition via _meta.ui. */
export interface AppToolMeta {
  resourceUri: string;
  visibility?: AppToolVisibility;
}

// ── Mode B: Tool-Attached App Config ─────────────────────────────────────────

/** Configuration for attaching an MCP App to an existing MCPTool (Mode B). */
export interface ToolAppConfig {
  /** URI for the UI resource. Must start with "ui://". */
  resourceUri: string;
  /** Human-readable name for the UI resource. */
  resourceName: string;
  /** Optional description of the UI resource. */
  resourceDescription?: string;
  /** HTML content — a string literal or a function returning one. */
  content: (() => Promise<string> | string) | string;
  /** CSP configuration for the iframe sandbox. */
  csp?: AppCSPConfig;
  /** Browser permissions needed by the app. */
  permissions?: AppPermissionsConfig;
  /** Whether the host should render a visible border. */
  prefersBorder?: boolean;
  /** Who can call this tool. Default: ["model", "app"]. */
  visibility?: AppToolVisibility;
}

// ── Mode A: App Tool Definition ──────────────────────────────────────────────

/** A tool definition declared within an MCPApp (Mode A). */
export interface AppToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<any>;
  /** Who can call this tool. Default: ["model", "app"]. */
  visibility?: AppToolVisibility;
  /** The tool handler. */
  execute: (input: any) => Promise<unknown>;
}

// ── Mode A: App Protocol ─────────────────────────────────────────────────────

/** Interface that all MCPApp instances must satisfy. */
export interface AppProtocol {
  name: string;
  ui: {
    resourceUri: string;
    resourceName: string;
    resourceDescription?: string;
    csp?: AppCSPConfig;
    permissions?: AppPermissionsConfig;
    prefersBorder?: boolean;
  };
  tools: AppToolDefinition[];
  getContent(): Promise<string> | string;
  validate(): void;
  resourceDefinition: ResourceDefinition;
  resourceMeta: AppUIResourceMeta | undefined;
  readResource(): Promise<ResourceContent[]>;
  getToolMeta(toolName: string): { ui: { resourceUri: string; visibility?: Array<string> } };
}
