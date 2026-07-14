import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ScannedItem } from './types.js';

export const SELF_REPO_URL = 'https://github.com/soundwala/spur';

/**
 * D4 (dogfooding): SPUR registers its own install as an entry in its own index,
 * so every scan also checks SPUR against upstream. Distribution is npm, so the
 * self check compares the installed package version against the npm registry.
 */
export function selfItem(): ScannedItem | null {
  const pkgRoot = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
  if (!pkgRoot) return null;
  const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as {
    name?: string;
    version?: string;
  };
  if (!pkg.name || !pkg.version) return null;
  return {
    name: pkg.name,
    type: 'plugin',
    install_method: 'npm',
    scope: 'user',
    install_path: pkgRoot,
    source_url: `https://registry.npmjs.org/${pkg.name.replace('/', '%2F')}`,
    source_ref: null,
    installed_version: pkg.version,
    is_self: true,
  };
}

function findPackageRoot(from: string): string | null {
  let dir = from;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
