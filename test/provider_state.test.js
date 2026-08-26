const assert = require('node:assert/strict');
const test = require('node:test');

const { fresh, stale, formatAge } = require('../src/provider_state');

test('marks old provider timestamps stale and retains last-good data on errors', () => {
  const now = new Date('2026-08-25T00:10:00.000Z');
  const value = fresh('codex', {
    source: 'codex-sessions', timestamp: '2026-08-25T00:00:00.000Z', models: [{ remainingPercentage: 50 }]
  }, now, 120000);
  assert.equal(value.health.status, 'stale');
  const retained = stale('codex', value, new Error('temporary failure'));
  assert.equal(retained.models[0].remainingPercentage, 50);
  assert.equal(retained.health.error, 'temporary failure');
  assert.equal(formatAge(value.health.fetchedAt, now), '10m');
});
