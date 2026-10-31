// Defines the trust and promotion rules for backend release artifacts.
export function validate_ci_release(run) {
  if (run.conclusion !== 'success' || run.event !== 'push' || run.head_branch !== 'main' || run.path !== '.github/workflows/ci.yml' || !/^[a-f0-9]{40}$/.test(run.head_sha || '')) {
    throw new Error('Deployment requires a successful EasyCart CI push run on main');
  }
}

export function previous_environment(target) {
  if (!['dev', 'qa', 'prod'].includes(target)) throw new Error('Unknown deployment environment');
  return { qa: 'dev', prod: 'qa' }[target];
}
