export * from './types.js';
export { openDb, defaultDbPath, spurHome, allEntries, entryId } from './db.js';
export { scan, discoverProjectRoots, type ScanOptions, type ScanResult } from './scan.js';
export { check, type CheckOptions, type CheckResult } from './check.js';
export { getStatus } from './status.js';
export { selfItem, SELF_REPO_URL } from './self.js';
export { gitAvailable } from './git.js';
export { update, selectTargets, type UpdateResult, type CommandRunner } from './update.js';
