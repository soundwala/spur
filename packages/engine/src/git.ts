import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';

const exec = promisify(execFile);

// Never let a git subprocess hang on an interactive credential prompt.
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -oBatchMode=yes' };

async function git(args: string[], timeoutMs = 15_000): Promise<string | null> {
  try {
    const { stdout } = await exec('git', args, { env: GIT_ENV, timeout: timeoutMs });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function gitAvailable(): Promise<boolean> {
  return (await git(['--version'])) !== null;
}

/** Root of the work tree containing dir, or null if not inside one. */
export async function gitToplevel(dir: string): Promise<string | null> {
  return git(['-C', dir, 'rev-parse', '--show-toplevel']);
}

export async function gitRemoteUrl(dir: string): Promise<string | null> {
  return git(['-C', dir, 'remote', 'get-url', 'origin']);
}

export async function gitHeadCommit(dir: string): Promise<string | null> {
  return git(['-C', dir, 'rev-parse', 'HEAD']);
}

/**
 * Upstream commit sha for a ref without cloning. No rate limits, works against
 * any git host, and private repos resolve through the user's existing git auth.
 */
export async function lsRemote(url: string, ref = 'HEAD'): Promise<string | null> {
  const out = await git(['ls-remote', url, ref], 30_000);
  if (!out) return null;
  const sha = out.split('\n')[0]?.split('\t')[0]?.trim();
  return sha && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

/** Tag short-names for a remote (deref suffixes and refs/tags/ stripped, deduped). */
export async function gitLsRemoteTags(url: string): Promise<string[]> {
  const out = await git(['ls-remote', '--tags', url], 30_000);
  if (!out) return [];
  const names = new Set<string>();
  for (const line of out.split('\n')) {
    const ref = line.split('\t')[1];
    const name = ref?.replace('refs/tags/', '').replace(/\^\{\}$/, '');
    if (name) names.add(name);
  }
  return [...names];
}

/** Shallow-clone a single ref into dest. Success is confirmed by the checkout existing. */
export async function gitCloneShallow(url: string, ref: string, dest: string): Promise<boolean> {
  await git(['clone', '--depth', '1', '--branch', ref, url, dest], 60_000);
  return existsSync(dest) && existsSync(`${dest}/.git`);
}
