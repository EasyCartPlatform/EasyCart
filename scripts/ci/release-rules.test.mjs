// Ensures PR runs, failed runs, and the wrong workflow cannot be promoted with deployment credentials.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate_ci_release, previous_environment } from './release-rules.mjs';
const good = { conclusion: 'success', event: 'push', head_branch: 'main', path: '.github/workflows/ci.yml', head_sha: 'a'.repeat(40) };
test('accepts only a successful main CI push release', () => assert.doesNotThrow(() => validate_ci_release(good)));
for (const [field, value] of [['event', 'pull_request'], ['conclusion', 'failure'], ['head_branch', 'fix/test'], ['path', '.github/workflows/other.yml'], ['head_sha', 'invalid']]) {
  test(`rejects release with ${field}=${value}`, () => assert.throws(() => validate_ci_release({ ...good, [field]: value })));
}
test('requires dev before QA and QA before production', () => {
  assert.equal(previous_environment('dev'), undefined);
  assert.equal(previous_environment('qa'), 'dev');
  assert.equal(previous_environment('prod'), 'qa');
  assert.throws(() => previous_environment('unknown'));
});

for (const branch of ['feature/mobile_Custcart', 'feature/test', 'feature/mobile/cart']) {
  test(`allows ${branch} only for dev`, () => {
    const feature = { ...good, head_branch: branch };
    assert.doesNotThrow(() => validate_ci_release(feature, 'dev'));
    for (const target of ['qa', 'prod']) assert.throws(() => validate_ci_release(feature, target));
  });
}
test('rejects an empty feature branch suffix', () => assert.throws(() => validate_ci_release({ ...good, head_branch: 'feature/' })));
