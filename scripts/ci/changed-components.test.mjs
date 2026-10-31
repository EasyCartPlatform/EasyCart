// Checks path filtering so shared changes cannot bypass a required component check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affected_components } from './changed-components.mjs';

test('documentation alone needs no application jobs', () => {
  assert.deepEqual(affected_components(['README.md']), { backend: false, frontend: false, mobile: false });
});
test('frontend changes do not install unrelated applications', () => {
  assert.deepEqual(affected_components(['frontend/src/app.tsx']), { backend: false, frontend: true, mobile: false });
});
test('mobile uses the mobile-app directory', () => {
  assert.equal(affected_components(['mobile-app/package-lock.json']).mobile, true);
});
test('shared CI changes exercise all workflows', () => {
  assert.deepEqual(affected_components(['.github/workflows/ci.yml']), { backend: true, frontend: true, mobile: true });
});
