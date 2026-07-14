import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spurHome } from './db.js';
import type { SkillSource, SourceStore } from './types.js';

function globalPath(): string {
  return join(spurHome(), 'sources.json');
}

function readStore(path: string): SourceStore | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<SourceStore>;
    return { sources: parsed.sources ?? [], local: parsed.local ?? [] };
  } catch {
    return null;
  }
}

export function loadStore(): SourceStore {
  return readStore(globalPath()) ?? { sources: [], local: [] };
}

export function saveStore(store: SourceStore): void {
  const path = globalPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2));
}

export function loadProjectStore(projectPath: string): SourceStore | null {
  return readStore(join(projectPath, '.spur.json'));
}

function findSkill(store: SourceStore, name: string): { source: SkillSource; subpath: string } | null {
  for (const source of store.sources) {
    const subpath = source.skills[name];
    if (subpath) return { source, subpath };
  }
  return null;
}

/** Project store wins over the global store. */
export function resolveSource(name: string, projectPath: string | null): { source: SkillSource; subpath: string } | null {
  if (projectPath) {
    const project = loadProjectStore(projectPath);
    const hit = project && findSkill(project, name);
    if (hit) return hit;
  }
  return findSkill(loadStore(), name);
}

export function isLocal(name: string, projectPath: string | null): boolean {
  if (projectPath && loadProjectStore(projectPath)?.local.includes(name)) return true;
  return loadStore().local.includes(name);
}

export function markLocal(name: string): void {
  const store = loadStore();
  if (!store.local.includes(name)) store.local.push(name);
  saveStore(store);
}

/** Merge a source into the global store (or a project's .spur.json with opts.project). */
export function upsertSource(source: SkillSource, opts: { project?: string } = {}): void {
  if (opts.project) {
    const path = join(opts.project, '.spur.json');
    const store = loadProjectStore(opts.project) ?? { sources: [], local: [] };
    mergeSource(store, source);
    writeFileSync(path, JSON.stringify(store, null, 2));
    return;
  }
  const store = loadStore();
  mergeSource(store, source);
  saveStore(store);
}

function mergeSource(store: SourceStore, incoming: SkillSource): void {
  const existing = store.sources.find((s) => s.repo === incoming.repo);
  if (!existing) {
    store.sources.push(incoming);
    return;
  }
  existing.skills = { ...existing.skills, ...incoming.skills };
  existing.ref = incoming.ref;
  existing.adopted_version = incoming.adopted_version;
}

export function setAdoptedVersion(name: string, projectPath: string | null, version: string): void {
  const apply = (store: SourceStore): boolean => {
    const source = store.sources.find((s) => s.skills[name]);
    if (!source) return false;
    source.adopted_version = version;
    return true;
  };
  if (projectPath) {
    const project = loadProjectStore(projectPath);
    if (project && apply(project)) {
      writeFileSync(join(projectPath, '.spur.json'), JSON.stringify(project, null, 2));
      return;
    }
  }
  const store = loadStore();
  if (apply(store)) saveStore(store);
}
