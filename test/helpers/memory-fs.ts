/**
 * An in-memory stand-in for the fs-extra calls the wallet store makes, for suites that
 * `jest.mock('fs-extra')`. Paths are kept as given (the store uses ./conf/wallets/...).
 */
import * as fse from 'fs-extra';

export class MemoryFs {
  readonly files = new Map<string, string>();

  private dirEntries(dir: string): { name: string; isFile: () => boolean; isDirectory: () => boolean }[] {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    const names = new Map<string, boolean>();
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const [head, ...tail] = rest.split('/');
      names.set(head, tail.length === 0);
    }
    return [...names].map(([name, isFile]) => ({ name, isFile: () => isFile, isDirectory: () => !isFile }));
  }

  /** Point the mocked fs-extra functions at this store. */
  install(): void {
    const mocked = fse as jest.Mocked<typeof fse>;
    (mocked.pathExists as jest.Mock).mockImplementation(async (path: string) => {
      const prefix = `${path}/`;
      return this.files.has(path) || [...this.files.keys()].some((p) => p.startsWith(prefix));
    });
    (mocked.readFile as jest.Mock).mockImplementation(async (path: string) => {
      const content = this.files.get(path);
      if (content === undefined) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      return content;
    });
    (mocked.writeFile as jest.Mock).mockImplementation(async (path: string, content: string) => {
      this.files.set(path, content);
    });
    (mocked.remove as jest.Mock).mockImplementation(async (path: string) => {
      this.files.delete(path);
    });
    (mocked.readdir as jest.Mock).mockImplementation(async (dir: string, options?: { withFileTypes?: boolean }) => {
      const entries = this.dirEntries(dir);
      return options?.withFileTypes ? entries : entries.map((e) => e.name);
    });
    (mocked.ensureDir as jest.Mock).mockResolvedValue(undefined);
    (mocked.mkdir as jest.Mock).mockResolvedValue(undefined);
    (mocked.chmod as jest.Mock).mockResolvedValue(undefined);
  }

  /** The addresses in a chain's list store (hardware-wallets.json, external-wallets.json, ...). */
  listStore(chain: string, file: string): string[] {
    const content = this.files.get(`./conf/wallets/${chain}/${file}`);
    return content ? JSON.parse(content).wallets.map((w: { address: string }) => w.address) : [];
  }
}
