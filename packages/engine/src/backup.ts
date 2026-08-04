import { mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { spurHome } from './db.js';

export interface BackupInfo {
  id: string;
  name: string;
  install_path: string;
  repo: string | null;
  version_before: string | null;
  backed_up_at: string;
  reason: string;
}

function backupsRoot(): string {
  return join(spurHome(), 'backups');
}

interface BackupSubject {
  name: string;
  install_path: string;
  project_path: string | null;
  source_url: string | null;
  installed_version: string | null;
}

/** Copy the skill folder aside BEFORE any overwrite. Throws on failure — callers must abort. */
export function createBackup(entry: BackupSubject, reason: string): BackupInfo {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const project = entry.project_path ? basename(entry.project_path) : 'user';
  const id = `${ts}__${project}__${entry.name}`;
  const dir = join(backupsRoot(), id);
  const info: BackupInfo = {
    id,
    name: entry.name,
    install_path: entry.install_path,
    repo: entry.source_url,
    version_before: entry.installed_version,
    backed_up_at: new Date().toISOString(),
    reason,
  };
  mkdirSync(join(dir, 'files'), { recursive: true });
  cpSync(entry.install_path, join(dir, 'files'), { recursive: true });
  writeFileSync(join(dir, 'backup.json'), JSON.stringify(info, null, 2));
  return info;
}

export function listBackups(): BackupInfo[] {
  const root = backupsRoot();
  if (!existsSync(root)) return [];
  const infos: BackupInfo[] = [];
  for (const id of readdirSync(root)) {
    try {
      infos.push(JSON.parse(readFileSync(join(root, id, 'backup.json'), 'utf8')) as BackupInfo);
    } catch {
      // not a backup dir — skip
    }
  }
  return infos.sort((a, b) => b.backed_up_at.localeCompare(a.backed_up_at));
}

export function restoreBackup(id: string, opts: { to?: string } = {}): { restored_to: string } {
  const dir = join(backupsRoot(), id);
  const info = JSON.parse(readFileSync(join(dir, 'backup.json'), 'utf8')) as BackupInfo;
  const target = opts.to ?? info.install_path;
  if (!opts.to && !existsSync(dirname(info.install_path))) {
    throw new Error(`original location ${info.install_path} no longer exists — pass --to <path>`);
  }
  mkdirSync(target, { recursive: true });
  cpSync(join(dir, 'files'), target, { recursive: true, force: true });
  return { restored_to: target };
}
