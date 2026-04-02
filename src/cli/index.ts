#!/usr/bin/env node
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { Command } from 'commander';
import { createProject } from './project/create.js';
import { addTool } from './project/add-tool.js';
import { addPrompt } from './project/add-prompt.js';
import { addResource } from './project/add-resource.js';
import { addApp } from './project/add-app.js';
import { buildFramework } from './framework/build.js';
import { validateCommand } from './commands/validate.js';

function checkForMcpConflict(): void {
  try {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'where mcp' : 'which -a mcp';
    const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const paths = result.trim().split(/\r?\n/).filter(Boolean);
    if (paths.length > 1) {
      console.warn(
        '\x1b[33m⚠ Warning: Multiple "mcp" executables found on your PATH:\x1b[0m'
      );
      for (const p of paths) {
        console.warn(`  - ${p}`);
      }
      console.warn(
        '\x1b[33mIf you experience unexpected behavior (e.g., from a Python mcp package),\n' +
          'use \x1b[1mmcp-framework\x1b[0m\x1b[33m instead. For example: mcp-framework create my-project\x1b[0m\n'
      );
    }
  } catch {
    // Silently ignore — `which`/`where` may not be available
  }
}

checkForMcpConflict();

const require = createRequire(import.meta.url);
const frameworkPackageJson = require('../../package.json');

const program = new Command();

program.name('mcp').description('CLI for managing MCP server projects').version(frameworkPackageJson.version);

program.command('build').description('Build the MCP project').action(buildFramework);

program
  .command('create')
  .description('Create a new MCP server project')
  .argument('[name]', 'project name')
  .option('--http', 'use HTTP transport instead of default stdio')
  .option('--cors', 'enable CORS with wildcard (*) access')
  .option('--port <number>', 'specify HTTP port (only valid with --http)', (val) =>
    parseInt(val, 10)
  )
  .option('--oauth', 'configure OAuth 2.1 authentication (requires --http)')
  .option('--no-install', 'skip npm install and build steps')
  .option('--no-example', 'skip creating example tool')
  .action(createProject);

program
  .command('add')
  .description('Add a new component to your MCP server')
  .addCommand(
    new Command('tool')
      .description('Add a new tool')
      .argument('[name]', 'tool name')
      .option('--react', 'generate a React-based tool with interactive UI')
      .action((name, opts) => addTool(name, opts))
  )
  .addCommand(
    new Command('prompt')
      .description('Add a new prompt')
      .argument('[name]', 'prompt name')
      .action(addPrompt)
  )
  .addCommand(
    new Command('resource')
      .description('Add a new resource')
      .argument('[name]', 'resource name')
      .action(addResource)
  )
  .addCommand(
    new Command('app')
      .description('Add a new app with interactive UI')
      .argument('[name]', 'app name')
      .option('--react', 'generate a React-based app view')
      .action((name, opts) => addApp(name, opts))
  );

program.addCommand(validateCommand);

program.parse();
