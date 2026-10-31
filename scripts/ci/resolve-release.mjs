// Accepts only successful main-branch CI artifacts and enforces promotion of the same tested commit.
import { appendFileSync } from 'node:fs';
import { github_api } from './github-api.mjs';
import { validate_ci_release, previous_environment } from './release-rules.mjs';

const run_id = process.env.CI_RUN_ID;
const target = process.env.TARGET_ENV || 'dev';
if (!/^\d+$/.test(run_id || '') || !['dev', 'qa', 'prod'].includes(target)) throw new Error('Choose a CI run ID and dev, qa, or prod');
const run = await github_api(`actions/runs/${run_id}`);
validate_ci_release(run);
const previous = previous_environment(target);
if (previous) {
  const deployments = await github_api(`deployments?sha=${run.head_sha}&environment=${previous}&per_page=100`);
  const latest = deployments.find((item) => String(item.payload?.ci_run_id) === run_id);
  const statuses = latest ? await github_api(`deployments/${latest.id}/statuses`) : [];
  if (statuses[0]?.state !== 'success') throw new Error(`Deploy this CI artifact successfully to ${previous} first`);
}
const { artifacts } = await github_api(`actions/runs/${run_id}/artifacts`);
if (!artifacts.some((item) => item.name === `backend-worker-${run.head_sha}` && !item.expired)) {
  if (process.env.AUTO_DEPLOY === 'true') { console.log('No backend release in this CI run; skipping deployment.'); process.exit(0); }
  throw new Error('Backend artifact is missing or expired; run CI for a backend change on main');
}
appendFileSync(process.env.GITHUB_OUTPUT, `sha=${run.head_sha}\nrun_id=${run_id}\nenvironment=${target}\n`);
