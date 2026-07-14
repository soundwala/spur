import type { EntryStatus } from './types.js';

/**
 * Some marketplace install records carry no gitCommitSha (observed in the
 * wild: frontend-design records version "unknown" and no sha at all). These
 * helpers implement the version-compare fallback tier; check.ts wires them to
 * the network and falls through to a commit-activity check when versions are
 * missing on either side.
 */

/** The installed manifest uses the literal string "unknown" as a null version. */
export function realVersion(v: string | null | undefined): string | null {
  return v && v !== 'unknown' ? v : null;
}

/** "./plugins/x" in a catalog means the plugin lives at plugins/x inside the marketplace repo. */
export function relSourcePath(source: unknown): string | null {
  if (typeof source !== 'string' || !source.startsWith('.')) return null;
  const path = source.replace(/^\.\/+/, '').replace(/^\.$/, '');
  return path || null;
}

export function catalogVersionFor(catalog: unknown, name: string): string | null {
  const plugins = (catalog as { plugins?: Array<{ name?: string; version?: string }> } | null)?.plugins;
  if (!Array.isArray(plugins)) return null;
  return realVersion(plugins.find((p) => p?.name === name)?.version) ?? null;
}

/** null = versions unavailable on one side; caller falls through to the next tier. */
export function versionOutcome(installed: string | null, upstream: string | null): Extract<EntryStatus, 'fresh' | 'stale'> | null {
  if (!installed || !upstream) return null;
  return installed === upstream ? 'fresh' : 'stale';
}
