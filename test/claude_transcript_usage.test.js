const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { readClaudeTranscriptUsage } = require('../src/claude_transcript_usage');

test('aggregates Claude transcript tokens and deduplicates streamed message records', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jag-claude-transcripts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const transcript = path.join(root, 'session.jsonl');
  const records = [
    {
      type: 'assistant', sessionId: 'session-1', timestamp: '2026-08-20T12:00:00.000Z',
      message: { id: 'message-1', model: 'claude-opus', usage: { input_tokens: 10, output_tokens: 5 } }
    },
    {
      type: 'assistant', sessionId: 'session-1', timestamp: '2026-08-20T12:00:01.000Z',
      message: {
        id: 'message-1', model: 'claude-opus',
        usage: { input_tokens: 20, output_tokens: 10, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 }
      }
    },
    {
      type: 'assistant', sessionId: 'session-2', timestamp: '2026-08-15T12:00:00.000Z',
      message: { id: 'message-2', model: 'claude-sonnet', usage: { input_tokens: 50, output_tokens: 50 } }
    }
  ];
  fs.writeFileSync(transcript, `${records.map(record => JSON.stringify(record)).join('\n')}\n`);

  const usage = await readClaudeTranscriptUsage([root], new Date('2026-08-21T00:00:00.000Z'));

  assert.equal(usage.last24Hours.totalTokens, 100);
  assert.equal(usage.last24Hours.turns, 1);
  assert.equal(usage.last7Days.totalTokens, 200);
  assert.equal(usage.last7Days.turns, 2);
  assert.deepEqual(usage.last7Days.models, { 'claude-opus': 100, 'claude-sonnet': 100 });
  assert.equal(usage.available, true);
  assert.equal(usage.rootsFound, 1);
  assert.equal(usage.discoveredFiles, 1);
  assert.equal(usage.scannedFiles, 1);
});

test('marks transcript activity unavailable when no configured root exists', async t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'jag-claude-missing-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));

  const usage = await readClaudeTranscriptUsage(
    [path.join(parent, 'missing')],
    new Date('2026-08-21T00:00:00.000Z')
  );

  assert.equal(usage.available, false);
  assert.equal(usage.rootsFound, 0);
  assert.equal(usage.discoveredFiles, 0);
  assert.equal(usage.last7Days.totalTokens, 0);
});
