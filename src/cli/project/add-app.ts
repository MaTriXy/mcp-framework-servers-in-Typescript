import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import prompts from 'prompts';
import { validateMCPProject } from '../utils/validate-project.js';
import { toPascalCase } from '../utils/string-utils.js';

export async function addApp(name?: string) {
  await validateMCPProject();

  let appName = name;
  if (!appName) {
    const response = await prompts([
      {
        type: 'text',
        name: 'name',
        message: 'What is the name of your app?',
        validate: (value: string) =>
          /^[a-z0-9-]+$/.test(value)
            ? true
            : 'App name can only contain lowercase letters, numbers, and hyphens',
      },
    ]);

    if (!response.name) {
      console.log('App creation cancelled');
      process.exit(1);
    }

    appName = response.name;
  }

  if (!appName) {
    throw new Error('App name is required');
  }

  const className = toPascalCase(appName);
  const fileName = `${className}App.ts`;
  const appsDir = join(process.cwd(), 'src/apps');
  const viewsDir = join(process.cwd(), 'src/app-views', appName);

  try {
    await mkdir(appsDir, { recursive: true });
    await mkdir(viewsDir, { recursive: true });

    const appContent = generateAppClass(appName, className);
    const htmlContent = generateHtmlView(appName, className);

    await writeFile(join(appsDir, fileName), appContent);
    await writeFile(join(viewsDir, 'index.html'), htmlContent);

    console.log(`App ${appName} created successfully:`);
    console.log(`  - App class: src/apps/${fileName}`);
    console.log(`  - HTML view: src/app-views/${appName}/index.html`);
  } catch (error) {
    console.error('Error creating app:', error);
    process.exit(1);
  }
}

function generateAppClass(appName: string, className: string): string {
  return `import { MCPApp } from "mcp-framework";
import { z } from "zod";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

class ${className}App extends MCPApp {
  name = "${appName}";

  ui = {
    resourceUri: "ui://${appName}/view",
    resourceName: "${className}",
    resourceDescription: "${className} interactive view",
  };

  getContent() {
    return readFileSync(
      join(__dirname, "../../app-views/${appName}/index.html"),
      "utf-8"
    );
  }

  tools = [
    {
      name: "${appName}_show",
      description: "Display the ${className} view",
      schema: z.object({
        query: z.string().describe("Input query"),
      }),
      execute: async (input: { query: string }) => {
        return { result: \`Processed: \${input.query}\` };
      },
    },
  ];
}

export default ${className}App;
`;
}

function generateHtmlView(appName: string, className: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${className}</title>
  <style>
    :root {
      --color-background-primary: light-dark(#ffffff, #1a1a1a);
      --color-text-primary: light-dark(#1a1a1a, #fafafa);
      --font-sans: system-ui, sans-serif;
    }
    body {
      margin: 0; padding: 16px;
      background: var(--color-background-primary);
      color: var(--color-text-primary);
      font-family: var(--font-sans);
    }
    #app { max-width: 600px; margin: 0 auto; }
  </style>
</head>
<body>
  <div id="app">Loading...</div>
  <script type="module">
    let nextId = 1;
    function sendRequest(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        function listener(event) {
          if (event.data?.id === id) {
            window.removeEventListener("message", listener);
            event.data?.result ? resolve(event.data.result) : reject(event.data?.error);
          }
        }
        window.addEventListener("message", listener);
        window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
      });
    }
    function onNotification(method, handler) {
      window.addEventListener("message", (event) => {
        if (event.data?.method === method) handler(event.data.params);
      });
    }

    const init = await sendRequest("initialize", {
      capabilities: {},
      clientInfo: { name: "${appName}", version: "1.0.0" },
      protocolVersion: "2026-01-26",
    });

    // Apply host theme
    const vars = init.hostContext?.styles?.variables;
    if (vars) {
      for (const [key, value] of Object.entries(vars)) {
        if (value) document.documentElement.style.setProperty(key, value);
      }
    }

    // Handle tool input
    onNotification("ui/notifications/tool-input", (params) => {
      document.getElementById("app").innerHTML =
        "<h2>${className}</h2><pre>" +
        JSON.stringify(params.arguments, null, 2) +
        "</pre>";
    });

    // Handle tool result
    onNotification("ui/notifications/tool-result", (params) => {
      const text = params.content?.[0]?.text ?? JSON.stringify(params);
      document.getElementById("app").innerHTML =
        "<h2>Result</h2><pre>" + text + "</pre>";
    });

    window.parent.postMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {}
    }, "*");
  </script>
</body>
</html>
`;
}
