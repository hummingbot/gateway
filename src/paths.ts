import fs from 'fs';
import path from 'path';

/**
 * Returns the project root path.
 *
 * This can be different depending on whether compiled scripts (i.e. in dist/)
 * are used, or, in jest's case, whether the .ts files are being run directly
 * via ts-jest.
 */
export function rootPath(): string {
  const insideDistDir: boolean = __filename.match(/dist\//) !== null;
  // Return absolute path to project root, always pointing to /Users/feng/gateway
  // regardless of environment
  return process.cwd();
}
