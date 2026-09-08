const assert = require('node:assert/strict');
const test = require('node:test');

const { parseClaudeUsage } = require('../src/claude_usage');

test('parses Claude Code statusLine rate-limit data', () => {
  const quota = parseClaudeUsage({
    source: 'claude-statusline',
    rate_limits: {
      five_hour: { used_percentage: 32.5, resets_at: 1787302800 },
      seven_day: { used_percentage: 61, resets_at: 1787803688 }
    }
  }, '/tmp/claude.json', new Date('2026-08-21T00:00:00.000Z'));

  assert.deepEqual(quota.models.map(model => model.label), ['5-Hour Limit', 'Weekly Limit']);
  assert.deepEqual(quota.models.map(model => model.remainingPercentage), [67.5, 39]);
});

test('parses OAuth-style fractional utilization caches', () => {
  const quota = parseClaudeUsage({
    five_hour: { utilization: 0.25, resets_at: '2026-08-22T00:00:00.000Z' }
  }, '/tmp/claude.json', new Date('2026-08-21T00:00:00.000Z'));

  assert.equal(quota.models[0].remainingPercentage, 75);
});

test('parses Claude Code cached usage from ~/.claude.json', () => {
  const quota = parseClaudeUsage({
    cachedUsageUtilization: {
      fetchedAtMs: Date.parse('2026-08-21T00:46:31.083Z'),
      utilization: {
        five_hour: { utilization: 0, resets_at: null },
        seven_day: { utilization: 92, resets_at: '2026-08-24T00:00:00.000Z' }
      }
    }
  }, '/tmp/.claude.json', new Date('2026-08-21T04:00:00.000Z'));

  assert.equal(quota.source, 'claude-local-cache');
  assert.equal(quota.timestamp, '2026-08-21T00:46:31.083Z');
  assert.deepEqual(quota.models.map(model => model.remainingPercentage), [100, 8]);
});

test('parses model-scoped weekly limits and millisecond reset timestamps', () => {
  const reset = Date.parse('2026-08-24T00:00:00.000Z');
  const quota = parseClaudeUsage({
    five_hour: { utilization: 10, resets_at: reset },
    seven_day: { utilization: 20, resets_at: null },
    seven_day_sonnet: { utilization: 75, resets_at: null },
    seven_day_oauth_apps: { utilization: 30, resets_at: null }
  }, '/tmp/usage-limits.json', new Date('2026-08-21T00:00:00.000Z'));

  assert.deepEqual(quota.models.map(model => model.label), [
    '5-Hour Limit',
    'Weekly Limit',
    'Weekly Sonnet Limit',
    'Weekly OAuth Apps Limit'
  ]);
  assert.equal(quota.models[0].resetsAt, '2026-08-24T00:00:00.000Z');
  assert.deepEqual(quota.models.map(model => model.remainingPercentage), [90, 80, 25, 70]);
});
