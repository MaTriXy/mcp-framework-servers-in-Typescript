# Resources

Resources are data sources that AI models can read or subscribe to. They serve as context providers in the MCP Framework.

## Resource Types

Resources can represent:
- Files
- API endpoints
- Database queries
- Real-time data streams
- Configuration data

## Creating Resources

### Via CLI

```bash
mcp add resource my-resource
```

This generates a new resource file at `src/resources/MyResource.ts`.

### Required Components

Every resource needs metadata (URI, name, description, MIME type) and an async `read` method:

```typescript
import { MCPResource } from "mcp-framework";

class ConfigResource extends MCPResource {
  uri = "resource://config";
  name = "Configuration";
  description = "System configuration settings";
  mimeType = "application/json";

  async read() {
    return [
      {
        uri: this.uri,
        mimeType: this.mimeType,
        text: JSON.stringify({
          version: "1.0.0",
          environment: "production",
          features: ["analytics", "reporting"],
        }),
      },
    ];
  }
}

export default ConfigResource;
```

## Resource Variations

### Static Resources

Serve fixed content like documentation:

```typescript
class DocumentationResource extends MCPResource {
  uri = "resource://docs";
  name = "Documentation";
  mimeType = "text/markdown";

  async read() {
    return [
      {
        uri: this.uri,
        mimeType: this.mimeType,
        text: "# API Documentation\n\nWelcome to our API...",
      },
    ];
  }
}
```

### Dynamic Resources

Fetch data from external sources during read operations:

```typescript
class MarketDataResource extends MCPResource {
  uri = "resource://market-data";
  name = "Market Data";
  mimeType = "application/json";

  async read() {
    const data = await this.fetch("https://api.market.com/latest");
    return [
      {
        uri: this.uri,
        mimeType: this.mimeType,
        text: JSON.stringify(data),
      },
    ];
  }
}
```

### Real-Time Resources

Use WebSocket subscriptions for continuous updates:

```typescript
class StockTickerResource extends MCPResource {
  uri = "resource://stock-ticker";
  name = "Stock Ticker";
  mimeType = "application/json";
  private ws: WebSocket | null = null;

  async subscribe() {
    this.ws = new WebSocket("wss://stocks.example.com");
    this.ws.on("message", this.handleUpdate);
  }

  async unsubscribe() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async read() {
    const latestData = await this.getLatestStockData();
    return [
      {
        uri: this.uri,
        mimeType: this.mimeType,
        text: JSON.stringify(latestData),
      },
    ];
  }
}
```

## Caching

Implement TTL-based caching to reduce unnecessary data fetching:

```typescript
class CachedResource extends MCPResource {
  private cache: any = null;
  private lastFetch: number = 0;
  private TTL = 60000; // 1 minute

  async read() {
    if (this.cache && Date.now() - this.lastFetch < this.TTL) {
      return this.cache;
    }

    const data = await this.fetchFreshData();
    this.cache = data;
    this.lastFetch = Date.now();
    return data;
  }
}
```

## Combining Resources with Tools

Resources can be used within tools for data access:

```typescript
class DataResource extends MCPResource {
  uri = "resource://data";
  name = "Data Store";

  async read() {
    return [
      {
        uri: this.uri,
        mimeType: "application/json",
        text: JSON.stringify(await this.getData()),
      },
    ];
  }
}

class DataProcessor extends MCPTool {
  async execute(input) {
    const resource = new DataResource();
    const [data] = await resource.read();
    return this.processData(JSON.parse(data.text));
  }
}
```

## Resource Discovery & Listing

The framework **automatically** handles the MCP `resources/list` protocol method. You do not need to implement any listing logic yourself.

### How It Works

1. Place your resource classes in `src/resources/` (or nested subdirectories)
2. Export each class as the default export
3. The framework discovers all resources at startup and registers them

When an MCP client calls `resources/list`, the framework returns the `resourceDefinition` of every registered resource — including `uri`, `name`, `description`, `mimeType`, and any optional fields like `title`, `icons`, `size`, or `annotations`.

### Example

Given these two resource files:

```
src/resources/ConfigResource.ts
src/resources/api/MarketDataResource.ts
```

An MCP client calling `resources/list` will receive both resources automatically:

```json
{
  "resources": [
    {
      "uri": "resource://config",
      "name": "Configuration",
      "description": "System configuration settings",
      "mimeType": "application/json"
    },
    {
      "uri": "resource://market-data",
      "name": "Market Data",
      "description": "Live market data",
      "mimeType": "application/json"
    }
  ]
}
```

### Resource Templates

If your resource defines a `template` property, it will also appear in `resources/templates/list`:

```typescript
class ItemResource extends MCPResource {
  uri = "resource://items/{id}";
  name = "Items";
  description = "Access items by ID";
  mimeType = "application/json";

  protected template = {
    uriTemplate: "resource://items/{id}",
    description: "Retrieve a specific item by its ID",
  };

  async read() {
    return [{ uri: this.uri, mimeType: this.mimeType, text: JSON.stringify({ id: "1" }) }];
  }
}
```

### Programmatic Registration

You can also register resources programmatically using `addResource()` before calling `start()`:

```typescript
import { MCPServer } from "mcp-framework";

const server = new MCPServer({ name: "my-server", version: "1.0.0" });

server.addResource(ConfigResource);
server.addResource(MarketDataResource);

await server.start();
```

Programmatic and auto-discovered resources are merged. If both define the same URI, the programmatic registration takes precedence.

## Best Practices

- Follow URI naming conventions: `resource://domain/type/identifier`
- Implement error handling with try-catch blocks
- Use TTL-based caching to reduce unnecessary data fetching
- Clean up subscriptions in `unsubscribe` methods

## Next Steps

- [Tools](./tools.md) - Learn about building tools
- [Prompts](./prompts.md) - Learn about prompt templates
