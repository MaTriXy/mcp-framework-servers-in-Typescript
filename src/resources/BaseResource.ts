import { CompletionResult } from '../prompts/BasePrompt.js';
import { MCPIcon, ContentAnnotations } from '../tools/BaseTool.js';

export type ResourceContent = {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
};

export type ResourceDefinition = {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  title?: string;
  icons?: MCPIcon[];
  size?: number;
  annotations?: ContentAnnotations;
};

export type ResourceTemplateDefinition = {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
  title?: string;
  icons?: MCPIcon[];
};

export interface ResourceProtocol {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  resourceDefinition: ResourceDefinition;
  templateDefinition?: ResourceTemplateDefinition;
  read(): Promise<ResourceContent[]>;
  subscribe?(): Promise<void>;
  unsubscribe?(): Promise<void>;
  complete?(argumentName: string, value: string): Promise<CompletionResult>;
}

export abstract class MCPResource implements ResourceProtocol {
  abstract uri: string;
  abstract name: string;
  description?: string;
  mimeType?: string;
  protected title?: string;
  protected icons?: MCPIcon[];
  protected size?: number;
  protected resourceAnnotations?: ContentAnnotations;

  protected template?: {
    uriTemplate: string;
    description?: string;
  };

  get resourceDefinition(): ResourceDefinition {
    return {
      uri: this.uri,
      name: this.name,
      description: this.description,
      mimeType: this.mimeType,
      ...(this.title && { title: this.title }),
      ...(this.icons && this.icons.length > 0 && { icons: this.icons }),
      ...(this.size !== undefined && { size: this.size }),
      ...(this.resourceAnnotations && Object.keys(this.resourceAnnotations).length > 0 && { annotations: this.resourceAnnotations }),
    };
  }

  get templateDefinition(): ResourceTemplateDefinition | undefined {
    if (!this.template) return undefined;
    return {
      uriTemplate: this.template.uriTemplate,
      name: this.name,
      description: this.template.description ?? this.description,
      mimeType: this.mimeType,
      ...(this.title && { title: this.title }),
      ...(this.icons && this.icons.length > 0 && { icons: this.icons }),
    };
  }

  abstract read(): Promise<ResourceContent[]>;

  async complete(argumentName: string, value: string): Promise<CompletionResult> {
    return { values: [] };
  }

  async subscribe?(): Promise<void> {
    throw new Error("Subscription not implemented for this resource");
  }

  async unsubscribe?(): Promise<void> {
    throw new Error("Unsubscription not implemented for this resource");
  }

  protected async fetch<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
}
