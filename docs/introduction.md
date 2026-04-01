# Introduction

mcp-framework is a TypeScript framework for building Model Context Protocol (MCP) servers. It provides an opinionated architecture with automatic directory-based discovery for tools, resources, and prompts.

## What is MCP?

The Model Context Protocol (MCP) is an open standard that enables AI models to interact with external tools, data sources, and services. MCP servers expose capabilities that AI clients (like Claude Desktop) can discover and use.

## Key Features

- **Tools** - Functions that AI models can invoke for data fetching, processing, and transformations
- **Resources** - Readable data sources with subscription capabilities for external data access
- **Prompts** - Reusable template systems for structured conversations
- **Apps** - Interactive HTML UIs (dashboards, forms, charts) that render inline in Claude, ChatGPT, VS Code, and other hosts
- **Transports** - Multiple communication layers:
  - **STDIO** for CLI tools and local integrations
  - **HTTP Stream** for web applications (recommended)
  - **SSE** for legacy web applications (deprecated)
- **Authentication** - Built-in support for OAuth 2.1, JWT, and API key authentication
- **TypeScript** - Full type safety with Zod schema validation

## How It Works

mcp-framework uses automatic directory-based discovery. You organize your tools, resources, and prompts in dedicated directories, and the framework automatically discovers and loads them at startup:

```
my-mcp-server/
├── src/
│   ├── tools/         # Automatically discovered tools
│   ├── resources/     # Automatically discovered resources
│   ├── prompts/       # Automatically discovered prompts
│   ├── apps/          # Automatically discovered MCP Apps
│   ├── app-views/     # HTML templates for MCP Apps
│   └── index.ts       # Server entry point
├── package.json
└── tsconfig.json
```

## Next Steps

- [Installation](./installation.md) - Get mcp-framework installed
- [Quickstart](./quickstart.md) - Build your first MCP server in 5 minutes
- [HTTP Quickstart](./http-quickstart.md) - Build an HTTP-based MCP server
- [MCP Apps](./apps.md) - Add interactive UIs to your tools
