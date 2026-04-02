import { describe, it, expect, beforeEach } from '@jest/globals';
import { MCPResource } from '../../src/resources/BaseResource.js';
import type {
  ResourceProtocol,
  ResourceContent,
  ResourceDefinition,
  ResourceTemplateDefinition,
} from '../../src/resources/BaseResource.js';

// ─── Test resource classes ────────────────────────────────────────────────────

class ConfigResource extends MCPResource {
  uri = 'resource://config';
  name = 'Configuration';
  description = 'System configuration settings';
  mimeType = 'application/json';

  async read(): Promise<ResourceContent[]> {
    return [
      {
        uri: this.uri,
        mimeType: this.mimeType,
        text: JSON.stringify({ version: '1.0.0', env: 'test' }),
      },
    ];
  }
}

class DocsResource extends MCPResource {
  uri = 'resource://docs';
  name = 'Documentation';
  description = 'API documentation';
  mimeType = 'text/markdown';

  async read(): Promise<ResourceContent[]> {
    return [
      {
        uri: this.uri,
        mimeType: this.mimeType,
        text: '# API Docs',
      },
    ];
  }
}

class MetricsResource extends MCPResource {
  uri = 'resource://metrics';
  name = 'Metrics';
  description = 'System metrics';
  mimeType = 'application/json';

  async read(): Promise<ResourceContent[]> {
    return [
      {
        uri: this.uri,
        mimeType: this.mimeType,
        text: JSON.stringify({ uptime: 12345, requests: 42 }),
      },
    ];
  }
}

class ItemTemplateResource extends MCPResource {
  uri = 'resource://items/{id}';
  name = 'Items';
  description = 'Access items by ID';
  mimeType = 'application/json';

  protected template = {
    uriTemplate: 'resource://items/{id}',
    description: 'Retrieve a specific item by its ID',
  };

  async read(): Promise<ResourceContent[]> {
    return [
      {
        uri: this.uri,
        mimeType: this.mimeType,
        text: JSON.stringify({ id: '1', name: 'Test Item' }),
      },
    ];
  }
}

class UserTemplateResource extends MCPResource {
  uri = 'resource://users/{userId}/profile';
  name = 'UserProfile';
  description = 'User profile data';
  mimeType = 'application/json';

  protected template = {
    uriTemplate: 'resource://users/{userId}/profile',
    description: 'Get user profile by ID',
  };

  async read(): Promise<ResourceContent[]> {
    return [
      {
        uri: this.uri,
        mimeType: this.mimeType,
        text: JSON.stringify({ userId: '1', name: 'Test User' }),
      },
    ];
  }
}

class BlobResource extends MCPResource {
  uri = 'resource://binary-data';
  name = 'BinaryData';
  description = 'Binary resource with blob content';
  mimeType = 'application/octet-stream';

  async read(): Promise<ResourceContent[]> {
    return [
      {
        uri: this.uri,
        mimeType: this.mimeType,
        blob: Buffer.from('binary content').toString('base64'),
      },
    ];
  }
}

class AnnotatedResource extends MCPResource {
  uri = 'resource://annotated';
  name = 'Annotated';
  description = 'Resource with all metadata fields';
  mimeType = 'application/json';
  protected title = 'Annotated Resource Title';
  protected size = 1024;
  protected icons = [{ src: 'https://example.com/icon.png', mimeType: 'image/png' }];
  protected resourceAnnotations = {
    audience: ['user', 'assistant'] as ('user' | 'assistant')[],
    priority: 0.9,
  };

  async read(): Promise<ResourceContent[]> {
    return [
      {
        uri: this.uri,
        mimeType: this.mimeType,
        text: '{}',
      },
    ];
  }
}

// ─── Simulate the MCPServer resource map and handler logic ────────────────────

/**
 * These tests verify that the ListResources / ReadResource / ListResourceTemplates
 * contract works correctly by exercising the same logic the MCPServer uses
 * (building a Map<string, ResourceProtocol> and mapping over it).
 *
 * This validates backward compatibility: any class extending MCPResource that
 * implements uri + name + read() will be correctly listed and readable.
 */
describe('ListResources contract tests', () => {
  let resourcesMap: Map<string, ResourceProtocol>;

  /**
   * Helper to simulate how MCPServer builds the resources map from loaded resources.
   */
  function buildResourcesMap(resources: ResourceProtocol[]): Map<string, ResourceProtocol> {
    return new Map(resources.map((r) => [r.uri, r]));
  }

  /**
   * Simulates the ListResourcesRequestSchema handler in MCPServer.
   */
  function listResources(map: Map<string, ResourceProtocol>) {
    return {
      resources: Array.from(map.values()).map((resource) => resource.resourceDefinition),
    };
  }

  /**
   * Simulates the ReadResourceRequestSchema handler in MCPServer.
   */
  async function readResource(map: Map<string, ResourceProtocol>, uri: string) {
    const resource = map.get(uri);
    if (!resource) {
      throw new Error(
        `Unknown resource: ${uri}. Available resources: ${Array.from(map.keys()).join(', ')}`
      );
    }
    return { contents: await resource.read() };
  }

  /**
   * Simulates the ListResourceTemplatesRequestSchema handler in MCPServer.
   */
  function listResourceTemplates(map: Map<string, ResourceProtocol>) {
    const templates = Array.from(map.values())
      .map((resource) => resource.templateDefinition)
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    return { resourceTemplates: templates };
  }

  describe('resources/list', () => {
    it('should return empty list when no resources are registered', () => {
      resourcesMap = buildResourcesMap([]);
      const result = listResources(resourcesMap);

      expect(result.resources).toEqual([]);
      expect(result.resources).toHaveLength(0);
    });

    it('should list a single resource with correct definition', () => {
      resourcesMap = buildResourcesMap([new ConfigResource()]);
      const result = listResources(resourcesMap);

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0]).toEqual({
        uri: 'resource://config',
        name: 'Configuration',
        description: 'System configuration settings',
        mimeType: 'application/json',
      });
    });

    it('should list multiple resources', () => {
      resourcesMap = buildResourcesMap([
        new ConfigResource(),
        new DocsResource(),
        new MetricsResource(),
      ]);
      const result = listResources(resourcesMap);

      expect(result.resources).toHaveLength(3);

      const uris = result.resources.map((r) => r.uri);
      expect(uris).toContain('resource://config');
      expect(uris).toContain('resource://docs');
      expect(uris).toContain('resource://metrics');
    });

    it('should include all ResourceDefinition fields', () => {
      resourcesMap = buildResourcesMap([new ConfigResource()]);
      const result = listResources(resourcesMap);
      const def = result.resources[0];

      expect(def).toHaveProperty('uri');
      expect(def).toHaveProperty('name');
      expect(def).toHaveProperty('description');
      expect(def).toHaveProperty('mimeType');
    });

    it('should include title, icons, size, and annotations when set', () => {
      resourcesMap = buildResourcesMap([new AnnotatedResource()]);
      const result = listResources(resourcesMap);
      const def = result.resources[0];

      expect(def.title).toBe('Annotated Resource Title');
      expect(def.size).toBe(1024);
      expect(def.icons).toEqual([{ src: 'https://example.com/icon.png', mimeType: 'image/png' }]);
      expect(def.annotations).toEqual({
        audience: ['user', 'assistant'],
        priority: 0.9,
      });
    });

    it('should omit optional fields when not set', () => {
      resourcesMap = buildResourcesMap([new ConfigResource()]);
      const result = listResources(resourcesMap);
      const def = result.resources[0];

      expect(def).not.toHaveProperty('title');
      expect(def).not.toHaveProperty('icons');
      expect(def).not.toHaveProperty('size');
      expect(def).not.toHaveProperty('annotations');
    });

    it('should include both regular and template resources', () => {
      resourcesMap = buildResourcesMap([
        new ConfigResource(),
        new ItemTemplateResource(),
      ]);
      const result = listResources(resourcesMap);

      expect(result.resources).toHaveLength(2);
      const uris = result.resources.map((r) => r.uri);
      expect(uris).toContain('resource://config');
      expect(uris).toContain('resource://items/{id}');
    });

    it('should deduplicate resources by URI (last write wins)', () => {
      // Simulates programmatic addResource overwriting a discovered one
      const map = buildResourcesMap([new ConfigResource()]);
      // Overwrite with a new instance (same URI)
      const overrideResource = new ConfigResource();
      overrideResource.description = 'Overridden config';
      map.set(overrideResource.uri, overrideResource);

      const result = listResources(map);
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].description).toBe('Overridden config');
    });
  });

  describe('resources/read', () => {
    beforeEach(() => {
      resourcesMap = buildResourcesMap([
        new ConfigResource(),
        new DocsResource(),
        new BlobResource(),
      ]);
    });

    it('should read a text resource by URI', async () => {
      const result = await readResource(resourcesMap, 'resource://config');

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe('resource://config');
      expect(result.contents[0].mimeType).toBe('application/json');
      expect(result.contents[0].text).toBeDefined();

      const parsed = JSON.parse(result.contents[0].text!);
      expect(parsed.version).toBe('1.0.0');
    });

    it('should read a markdown resource', async () => {
      const result = await readResource(resourcesMap, 'resource://docs');

      expect(result.contents[0].text).toBe('# API Docs');
      expect(result.contents[0].mimeType).toBe('text/markdown');
    });

    it('should read a blob resource', async () => {
      const result = await readResource(resourcesMap, 'resource://binary-data');

      expect(result.contents[0].blob).toBeDefined();
      expect(result.contents[0].text).toBeUndefined();
      const decoded = Buffer.from(result.contents[0].blob!, 'base64').toString();
      expect(decoded).toBe('binary content');
    });

    it('should throw for unknown resource URI', async () => {
      await expect(readResource(resourcesMap, 'resource://nonexistent')).rejects.toThrow(
        'Unknown resource: resource://nonexistent'
      );
    });

    it('should include available resources in error message', async () => {
      await expect(readResource(resourcesMap, 'resource://bad')).rejects.toThrow(
        /Available resources:.*resource:\/\/config/
      );
    });
  });

  describe('resources/templates/list', () => {
    it('should return empty when no templates exist', () => {
      resourcesMap = buildResourcesMap([new ConfigResource(), new DocsResource()]);
      const result = listResourceTemplates(resourcesMap);

      expect(result.resourceTemplates).toEqual([]);
    });

    it('should list a single template', () => {
      resourcesMap = buildResourcesMap([new ItemTemplateResource()]);
      const result = listResourceTemplates(resourcesMap);

      expect(result.resourceTemplates).toHaveLength(1);
      expect(result.resourceTemplates[0]).toEqual({
        uriTemplate: 'resource://items/{id}',
        name: 'Items',
        description: 'Retrieve a specific item by its ID',
        mimeType: 'application/json',
      });
    });

    it('should list multiple templates', () => {
      resourcesMap = buildResourcesMap([
        new ItemTemplateResource(),
        new UserTemplateResource(),
      ]);
      const result = listResourceTemplates(resourcesMap);

      expect(result.resourceTemplates).toHaveLength(2);
      const uriTemplates = result.resourceTemplates.map((t) => t.uriTemplate);
      expect(uriTemplates).toContain('resource://items/{id}');
      expect(uriTemplates).toContain('resource://users/{userId}/profile');
    });

    it('should filter out resources without templates', () => {
      resourcesMap = buildResourcesMap([
        new ConfigResource(),         // no template
        new ItemTemplateResource(),   // has template
        new DocsResource(),           // no template
        new UserTemplateResource(),   // has template
      ]);
      const result = listResourceTemplates(resourcesMap);

      expect(result.resourceTemplates).toHaveLength(2);
    });
  });

  describe('programmatic addResource simulation', () => {
    it('should support adding resources before initialization', () => {
      resourcesMap = new Map();

      // Simulate addResource() - instantiate and add to map
      const resource = new ConfigResource();
      resourcesMap.set(resource.uri, resource);

      const result = listResources(resourcesMap);
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].name).toBe('Configuration');
    });

    it('should merge programmatic and discovered resources', () => {
      // Simulate loader-discovered resources
      const discovered = buildResourcesMap([new ConfigResource(), new DocsResource()]);

      // Simulate programmatic addResource (pre-registered resources restored after load)
      const programmatic = new MetricsResource();
      discovered.set(programmatic.uri, programmatic);

      const result = listResources(discovered);
      expect(result.resources).toHaveLength(3);
    });

    it('should allow programmatic resources to override discovered ones', () => {
      const discovered = buildResourcesMap([new ConfigResource()]);

      // Override with programmatic version
      const override = new ConfigResource();
      override.description = 'Custom override';
      discovered.set(override.uri, override);

      const result = listResources(discovered);
      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].description).toBe('Custom override');
    });
  });

  describe('subscribe and unsubscribe', () => {
    it('should throw for resources without subscription support', async () => {
      const resource = new ConfigResource();

      if (resource.subscribe) {
        await expect(resource.subscribe()).rejects.toThrow('Subscription not implemented');
      }
      if (resource.unsubscribe) {
        await expect(resource.unsubscribe()).rejects.toThrow('Unsubscription not implemented');
      }
    });
  });

  describe('complete', () => {
    it('should return empty values by default', async () => {
      const resource = new ConfigResource();
      const result = await resource.complete('arg', 'val');
      expect(result).toEqual({ values: [] });
    });
  });

  describe('backward compatibility', () => {
    it('should maintain ResourceProtocol interface shape', () => {
      const resource: ResourceProtocol = new ConfigResource();

      // Required properties
      expect(typeof resource.uri).toBe('string');
      expect(typeof resource.name).toBe('string');
      expect(typeof resource.resourceDefinition).toBe('object');
      expect(typeof resource.read).toBe('function');

      // Optional properties
      expect(resource.templateDefinition === undefined || typeof resource.templateDefinition === 'object').toBe(true);
    });

    it('should return ResourceDefinition with required fields from resourceDefinition getter', () => {
      const resource = new ConfigResource();
      const def: ResourceDefinition = resource.resourceDefinition;

      // uri and name are always required
      expect(typeof def.uri).toBe('string');
      expect(typeof def.name).toBe('string');
    });

    it('should work with resources that only define uri, name, and read()', () => {
      // Minimal resource - only required fields
      class MinimalResource extends MCPResource {
        uri = 'resource://minimal';
        name = 'Minimal';

        async read(): Promise<ResourceContent[]> {
          return [{ uri: this.uri, text: 'minimal' }];
        }
      }

      const resource = new MinimalResource();
      const map = buildResourcesMap([resource]);
      const result = listResources(map);

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].uri).toBe('resource://minimal');
      expect(result.resources[0].name).toBe('Minimal');
      // Optional fields should be undefined (omitted from definition)
      expect(result.resources[0].mimeType).toBeUndefined();
    });

    it('should support resources returning multiple content items from read()', async () => {
      class MultiContentResource extends MCPResource {
        uri = 'resource://multi';
        name = 'Multi';

        async read(): Promise<ResourceContent[]> {
          return [
            { uri: 'resource://multi/part1', text: 'Part 1' },
            { uri: 'resource://multi/part2', text: 'Part 2' },
          ];
        }
      }

      const resource = new MultiContentResource();
      const contents = await resource.read();
      expect(contents).toHaveLength(2);
    });
  });
});
