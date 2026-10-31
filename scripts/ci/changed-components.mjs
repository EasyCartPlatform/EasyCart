// Detects affected apps for CI; unknown or initial revisions conservatively check everything.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function affected_components(files) {
  const shared = files.some((file) => /^(\.github\/|scripts\/ci\/|skill\.md$)/.test(file));
  return Object.fromEntries(['backend', 'frontend', 'mobile'].map((app) => [
    app, shared || files.some((file) => file.startsWith(`${app === 'mobile' ? 'mobile-app' : app}/`))
  ]));
}

if (process.env.GITHUB_OUTPUT && process.argv[1] === fileURLToPath(import.meta.url)) {
  let affected = { backend: true, frontend: true, mobile: true };
  const base = process.env.BASE_SHA;
  if (base && !/^0+$/.test(base) && process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    const files = execFileSync('git', ['diff', '--name-only', '-z', base, process.env.GITHUB_SHA], { encoding: 'utf8' }).split('\0');
    affected = affected_components(files);
  }
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(affected).map(([key, value]) => `${key}=${value}\n`).join(''));
}
