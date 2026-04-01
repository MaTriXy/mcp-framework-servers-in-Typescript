import { join, dirname } from 'path';
import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import { logger } from '../core/Logger.js';
import { discoverFilesRecursively, hasValidFiles } from '../utils/fileDiscovery.js';

export interface LoaderConfig {
  subdirectory: string;
  excludedFiles: string[];
  extensions: string[];
}

export abstract class BaseLoader<T> {
  protected readonly directory: string;
  protected readonly config: LoaderConfig;

  constructor(config: LoaderConfig, basePath?: string) {
    this.config = config;
    this.directory = this.resolveDirectory(config.subdirectory, basePath);
  }

  private resolveDirectory(subdirectory: string, basePath?: string): string {
    if (basePath) {
      const dir = join(basePath, subdirectory);
      logger.debug(`Using provided base path for ${subdirectory}: ${dir}`);
      return dir;
    }

    // 1. Check project root dist/ directory (most common case)
    const projectRoot = process.cwd();
    const distPath = join(projectRoot, 'dist', subdirectory);

    if (existsSync(distPath)) {
      logger.debug(`Using project's dist/${subdirectory} directory: ${distPath}`);
      return distPath;
    }

    // 2. Walk up from the main module (process.argv[1]) to find the subdirectory.
    //    This handles npx where argv[1] is deep inside a temp/cache directory
    //    but the package's dist/tools etc. are siblings to the entry point.
    const mainModulePath = process.argv[1];
    if (mainModulePath) {
      let searchDir = dirname(mainModulePath);
      // Search up to 5 levels up from the entry point
      for (let i = 0; i < 5; i++) {
        const candidate = join(searchDir, subdirectory);
        if (existsSync(candidate)) {
          logger.debug(`Found ${subdirectory} by walking up from argv[1]: ${candidate}`);
          return candidate;
        }
        const parent = dirname(searchDir);
        if (parent === searchDir) break; // reached filesystem root
        searchDir = parent;
      }
    }

    // 3. Original fallback: derive from module path
    const moduleDir = mainModulePath ? dirname(mainModulePath) : projectRoot;
    const dir = moduleDir.endsWith('dist')
      ? join(moduleDir, subdirectory)
      : join(moduleDir, 'dist', subdirectory);

    logger.debug(`Using module path for ${subdirectory}: ${dir}`);
    return dir;
  }

  async hasItems(): Promise<boolean> {
    try {
      return await hasValidFiles(this.directory, {
        extensions: this.config.extensions,
        excludePatterns: this.config.excludedFiles,
      });
    } catch (error) {
      logger.debug(`No ${this.config.subdirectory} directory found: ${(error as Error).message}`);
      return false;
    }
  }

  protected abstract validateItem(item: any): item is T;
  protected abstract createInstance(ItemClass: any): T;
  protected abstract getItemName(item: T): string;

  async loadItems(): Promise<T[]> {
    try {
      logger.debug(`Attempting to load ${this.config.subdirectory} from: ${this.directory}`);

      const files = await discoverFilesRecursively(this.directory, {
        extensions: this.config.extensions,
        excludePatterns: this.config.excludedFiles,
      });

      if (files.length === 0) {
        logger.debug(`No ${this.config.subdirectory} files found`);
        return [];
      }

      logger.debug(`Found ${this.config.subdirectory} files: ${files.join(', ')}`);

      const items: T[] = [];

      for (const file of files) {
        try {
          const fullPath = join(this.directory, file);
          logger.debug(
            `Attempting to load ${this.config.subdirectory.slice(0, -1)} from: ${fullPath}`
          );

          const importPath = pathToFileURL(fullPath).href;
          const module = await import(importPath);

          let ItemClass = null;

          if (module.default && typeof module.default === 'function') {
            ItemClass = module.default;
          } else if (typeof module === 'function') {
            ItemClass = module;
          } else {
            const keys = Object.keys(module).filter((key) => key !== 'default');
            for (const key of keys) {
              const exportValue = module[key];
              if (typeof exportValue === 'function') {
                ItemClass = exportValue;
                break;
              }
            }
          }

          if (!ItemClass) {
            logger.warn(`No valid export found in ${file}`);
            continue;
          }

          const item = this.createInstance(ItemClass);
          if (this.validateItem(item)) {
            items.push(item);
          }
        } catch (error) {
          logger.error(
            `Error loading ${this.config.subdirectory.slice(0, -1)} ${file}: ${(error as Error).message}`
          );
        }
      }

      logger.debug(
        `Successfully loaded ${items.length} ${this.config.subdirectory}: ${items.map(this.getItemName).join(', ')}`
      );
      return items;
    } catch (error) {
      logger.error(`Failed to load ${this.config.subdirectory}: ${(error as Error).message}`);
      return [];
    }
  }
}
