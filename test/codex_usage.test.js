const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { parseRateLimitRecord, readCodexQuota } = require('../src/codex_usage');

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

test('falls back to archived Codex sessions and reads the newest token count from the tail', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jag-codex-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sessions = path.join(root, 'sessions');
  const archive = path.join(root, 'archived_sessions');
  fs.mkdirSync(sessions, { recursive: true });
  fs.mkdirSync(archive, { recursive: true });
  const file = path.join(archive, 'rollout-archived.jsonl');
  const filler = JSON.stringify({ type: 'event_msg', payload: { type: 'other', text: 'x'.repeat(70000) } });
  const tokenCount = JSON.stringify({
    type: 'event_msg',
    timestamp: new Date().toISOString(),
    payload: {
      type: 'token_count',
      rate_limits: {
        plan_type: 'pro',
        primary: { used_percent: 20, window_minutes: 300, resets_in_seconds: 3600 }
      }
    }
  });
  fs.writeFileSync(file, `${filler}\n${tokenCount}\n{\"incomplete\"`);

  const quota = await readCodexQuota(sessions);
  assert.equal(quota.source, 'codex-sessions');
  assert.equal(quota.sessionFile, file);
  assert.equal(quota.models[0].remainingPercentage, 80);
});
