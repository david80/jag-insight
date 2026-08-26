const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  readGeminiUsage,
  extractTurnsFromObject,
  setGeminiCacheDirectory
} = require('../src/gemini_usage');

test('extracts Gemini usage metadata from current nested JSON sessions', () => {
  const turns = extractTurnsFromObject({
    sessionId: 'session-1',
    messages: [{
      id: 'response-1',
      timestamp: '2026-08-24T12:00:00.000Z',
      model: 'gemini-3.5-flash',
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        cachedContentTokenCount: 3,
        thoughtsTokenCount: 2,
        totalTokenCount: 20
      }
    }]
  });

  assert.equal(turns.length, 1);
  assert.equal(turns[0].sessionId, 'session-1');
  assert.equal(turns[0].totalTokens, 20);
  assert.equal(turns[0].thoughtTokens, 2);
});

test('discovers project-scoped Gemini JSON sessions under tmp/hash/chats', async t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'jag-gemini-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const chats = path.join(home, 'tmp', 'project-hash', 'chats');
  const cache = path.join(home, 'cache');
  fs.mkdirSync(chats, { recursive: true });
  fs.writeFileSync(path.join(chats, 'session.json'), JSON.stringify({
    sessionId: 'gemini-session',
    messages: [{
      id: 'turn-1', timestamp: '2026-08-24T12:00:00.000Z', model: 'gemini-3.5-flash',
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 }
    }]
  }));
  setGeminiCacheDirectory(cache);

  const usage = await readGeminiUsage(path.join(home, 'tmp'), '', new Date('2026-08-25T00:00:00.000Z'));
  assert.equal(usage.source, 'gemini-sessions');
  assert.equal(usage.last24Hours.totalTokens, 150);
  assert.equal(usage.last24Hours.sessions, 1);
});

test('prefers prompt-free local Gemini OpenTelemetry when configured', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jag-gemini-otel-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const telemetry = path.join(root, 'telemetry.log');
  fs.writeFileSync(telemetry, `${JSON.stringify({
    name: 'gemini_cli.api_response',
    timestamp: '2026-08-24T12:00:00.000Z',
    attributes: {
      'session.id': 'otel-session',
      'request.id': 'request-1',
      'gen_ai.response.model': 'gemini-3.5-flash',
      'gen_ai.usage.input_tokens': 20,
      'gen_ai.usage.output_tokens': 10
    }
  })}\n`);
  setGeminiCacheDirectory(path.join(root, 'cache'));

  const usage = await readGeminiUsage(path.join(root, 'missing'), telemetry, new Date('2026-08-25T00:00:00.000Z'));
  assert.equal(usage.source, 'gemini-telemetry');
  assert.equal(usage.last24Hours.totalTokens, 30);
});
