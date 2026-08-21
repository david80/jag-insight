const assert = require('node:assert/strict');
const test = require('node:test');

const { parseRateLimitRecord } = require('../src/codex_usage');

test('parses Codex windows by duration instead of primary/secondary position', () => {
  const record = {
    timestamp: '2026-08-21T00:00:00.000Z',
    payload: {
      rate_limits: {
        plan_type: 'pro',
        primary: {
          used_percent: 9,
          window_minutes: 10080,
          resets_at: 1787803688
        },
        secondary: {
          used_percent: 35,
          window_minutes: 300,
          resets_at: 1787302800
        }
      }
    }
  };

  const quota = parseRateLimitRecord(record, '/tmp/session.jsonl', new Date('2026-08-21T01:00:00.000Z'));

  assert.equal(quota.planType, 'pro');
  assert.deepEqual(quota.models.map(model => model.label), ['Weekly Limit', '5-Hour Limit']);
  assert.deepEqual(quota.models.map(model => model.remainingPercentage), [91, 65]);
});

test('uses resets_in_seconds when resets_at is absent', () => {
  const record = {
    timestamp: '2026-08-21T00:00:00.000Z',
    payload: {
      rate_limits: {
        primary: {
          used_percent: 25,
          window_minutes: 300,
          resets_at: null,
          resets_in_seconds: 3600
        }
      }
    }
  };

  const quota = parseRateLimitRecord(record, '/tmp/session.jsonl', new Date('2026-08-21T00:30:00.000Z'));

  assert.equal(quota.models[0].resetsAt, '2026-08-21T01:00:00.000Z');
  assert.equal(quota.models[0].isOutdated, false);
});
