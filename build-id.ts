import { execSync } from 'node:child_process';

/**
 * A short, human-readable stamp shown in the app, so anyone holding a copy of
 * the single file can tell which one it is. Several copies of index.html look
 * identical otherwise.
 */
export function buildId(): string {
  let sha = 'local';
  try {
    sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    /* not a git checkout: the date alone still identifies the build */
  }
  return `${new Date().toISOString().slice(0, 10)} · ${sha}`;
}
