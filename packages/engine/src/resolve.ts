import { sep } from 'node:path';
import { gitToplevel, gitRemoteUrl, gitHeadCommit } from './git.js';
import type { InstallMethod } from './types.js';

export interface ResolvedSource {
  install_method: InstallMethod;
  source_url: string | null;
  source_ref: string | null;
  installed_commit: string | null;
}

const UNKNOWN: ResolvedSource = {
  install_method: 'unknown',
  source_url: null,
  source_ref: null,
  installed_commit: null,
};

/**
 * Figure out where a skill directory came from by inspecting git state.
 *
 * A work tree only counts as the skill's source when its root is the skill dir
 * itself or lives inside a .claude tree. A project-scope skill committed to the
 * enclosing project repo would otherwise "resolve" to the project's remote, and
 * comparing the project's HEAD to upstream says nothing about the skill.
 */
export async function resolveDir(dir: string): Promise<ResolvedSource> {
  const toplevel = await gitToplevel(dir);
  if (!toplevel) return UNKNOWN;

  const ownRepo = toplevel === dir || toplevel.includes(`${sep}.claude${sep}`);
  if (!ownRepo) return UNKNOWN;

  const [url, commit] = await Promise.all([gitRemoteUrl(toplevel), gitHeadCommit(toplevel)]);
  if (!url || !commit) return UNKNOWN;

  return {
    install_method: 'git',
    source_url: normalizeGitUrl(url),
    source_ref: null, // compare against upstream HEAD (default branch)
    installed_commit: commit,
  };
}

/** ssh/scp-style remotes → https form so one URL shape reaches ls-remote and the GitHub API. */
export function normalizeGitUrl(url: string): string {
  const scp = url.match(/^git@([^:]+):(.+?)(\.git)?$/);
  if (scp) return `https://${scp[1]}/${scp[2]}`;
  return url.replace(/\.git$/, '');
}
