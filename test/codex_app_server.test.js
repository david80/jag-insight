const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const test = require('node:test');

const {
  fetchCodexAppServerQuota,
  parseCodexAppServerRateLimits
} = require('../src/codex_app_server');

test('parses documented Codex app-server rate-limit buckets', () => {
  const quota = parseCodexAppServerRateLimits({
    rateLimits: {
      limitId: 'codex', planType: 'pro',
      primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1787619600 },
      secondary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 1788000000 }
    }
  }, new Date('2026-08-25T00:00:00.000Z'));
  assert.equal(quota.source, 'codex-app-server');
  assert.deepEqual(quota.models.map(model => model.label), ['5-Hour Limit', 'Weekly Limit']);
  assert.deepEqual(quota.models.map(model => model.remainingPercentage), [75, 60]);
});

test('performs initialize, initialized, and rate-limit read handshake', async () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.kill = () => {};
  let input = '';
  child.stdin.on('data', chunk => {
    input += chunk.toString();
    const lines = input.split('\n');
    input = lines.pop();
    for (const line of lines.filter(Boolean)) {
      const message = JSON.parse(line);
      if (message.method === 'initialize') {
        child.stdout.write(`${JSON.stringify({ id: 1, result: {} })}\n`);
      } else if (message.method === 'account/rateLimits/read') {
        child.stdout.write(`${JSON.stringify({
          id: 2,
          result: { rateLimits: { primary: { usedPercent: 10, windowDurationMins: 300 } } }
        })}\n`);
      }
    }
  });

  const quota = await fetchCodexAppServerQuota({ spawnImpl: () => child, timeoutMs: 1000 });
  assert.equal(quota.models[0].remainingPercentage, 90);
});
