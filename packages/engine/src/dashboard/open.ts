import { execFile } from 'node:child_process';

/** Best-effort: open the URL in the user's default browser; silently no-op if it can't. */
export function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    execFile(cmd, args, () => {});
  } catch {
    /* ignore — the URL is also printed to the console */
  }
}
