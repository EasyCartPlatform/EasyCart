// Records the exact promoted CI artifact and the final deployment state for the next environment gate.
import { github_api } from './github-api.mjs';
const deployment = await github_api('deployments', { method: 'POST', body: JSON.stringify({
  ref: process.env.RELEASE_SHA, environment: process.env.TARGET_ENV, auto_merge: false, required_contexts: [],
  production_environment: process.env.TARGET_ENV === 'prod', payload: { ci_run_id: process.env.CI_RUN_ID },
  description: 'Cloudflare backend release from verified CI artifact'
}) });
await github_api(`deployments/${deployment.id}/statuses`, { method: 'POST', body: JSON.stringify({
  state: process.env.DEPLOY_RESULT === 'success' ? 'success' : 'failure', environment_url: process.env.BACKEND_URL,
  log_url: `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  auto_inactive: false
}) });
