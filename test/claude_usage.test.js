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

test('treats a utilization value of 1 in ~/.claude.json as 1 percent', () => {
  const quota = parseClaudeUsage({
    cachedUsageUtilization: {
      fetchedAtMs: Date.parse('2026-09-22T00:16:06.469Z'),
      utilization: {
        five_hour: { utilization: 1, resets_at: '2026-09-22T05:00:00.000Z' },
        seven_day: { utilization: 38, resets_at: '2026-09-28T00:00:00.000Z' }
      }
    }
  }, '/tmp/.claude.json', new Date('2026-09-22T00:17:00.000Z'));

  assert.deepEqual(quota.models.map(model => model.usedPercentage), [1, 38]);
});

test('reads model-specific weekly usage from the current Claude Code cache limits list', () => {
  const quota = parseClaudeUsage({
    cachedUsageUtilization: {
      fetchedAtMs: Date.parse('2026-09-22T02:37:00.000Z'),
      utilization: {
        five_hour: { utilization: 14, resets_at: '2026-09-22T05:00:00.000Z' },
        seven_day: { utilization: 41, resets_at: '2026-09-28T00:00:00.000Z' },
        seven_day_fable: null,
        limits: [
          { kind: 'session', percent: 14, resets_at: '2026-09-22T05:00:00.000Z' },
          { kind: 'weekly_all', percent: 41, resets_at: '2026-09-28T00:00:00.000Z' },
          {
            kind: 'weekly_scoped', percent: 43,
            resets_at: '2026-09-28T00:00:00.000Z',
            scope: { model: { display_name: 'Fable' } }
          }
        ]
      }
    }
  }, '/tmp/.claude.json', new Date('2026-09-22T02:38:00.000Z'));

  assert.deepEqual(quota.models.map(model => [model.label, model.usedPercentage]), [
    ['5-Hour Limit', 14],
    ['Weekly Limit', 41],
    ['Weekly Fable Limit', 43]
  ]);
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
