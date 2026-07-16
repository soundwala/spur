export * from './types.js';
export { openDb, defaultDbPath, spurHome, allEntries, entryId } from './db.js';
export { scan, discoverProjectRoots, type ScanOptions, type ScanResult } from './scan.js';
export { check, type CheckOptions, type CheckResult } from './check.js';
export { getStatus } from './status.js';
export { selfItem, SELF_REPO_URL } from './self.js';
export { gitAvailable } from './git.js';
export { update, selectTargets, type UpdateResult, type CommandRunner } from './update.js';
export { adopt, install, type AdoptResult, type InstallResult } from './adopt.js';
export {
  loadStore, saveStore, resolveSource, isLocal, markLocal, upsertSource, setAdoptedVersion,
  setIgnore, clearIgnore, ignoreValueFor,
} from './sources.js';
export { realRepoOps, latestTag, type RepoOps, type TagInfo } from './repo.js';
export { startDashboard } from './dashboard/server.js';
export { createBackup, listBackups, restoreBackup, type BackupInfo } from './backup.js';
export { frontmatterVersion, skillDirVersion } from './fallback.js';
