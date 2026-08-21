const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_STATUS_BAR_FORMAT,
  summarizeQuotas,
  formatStatusBarText,
  formatStatusBarSegments
} = require('../src/status_summary');

test('separates Antigravity provider quotas from external Codex and Claude Code', () => {
  const models = [
    { label: 'Gemini 3.5 Flash', modelId: 'gemini', remainingPercentage: 48 },
    { label: 'GPT-OSS 120B', modelId: 'MODEL_OPENAI_GPT_OSS', remainingPercentage: 72 },
    { label: 'Claude Sonnet', modelId: 'claude', remainingPercentage: 83 }
  ];
  const codexQuota = { models: [{ remainingPercentage: 91 }] };
  const claudeCodeQuota = { models: [{ remainingPercentage: 64 }] };

  const summary = summarizeQuotas(models, codexQuota, claudeCodeQuota);
  const text = formatStatusBarText(DEFAULT_STATUS_BAR_FORMAT, summary);

  assert.equal(text, '$(hubot) AG(AG 48%, CX 72%, CL 83%) | CX:91% | CC:64%');
});

test('keeps the legacy local Claude placeholder working', () => {
  const summary = summarizeQuotas([
    { label: 'Claude Opus', remainingPercentage: 55 }
  ], null, null);

  assert.equal(formatStatusBarText('CL: {cl}', summary), 'CL: 55%');
});

test('falls back to Claude Code token usage rendering when rate limit percentage is missing', () => {
  const summary = summarizeQuotas([], null, {
    activity: {
      last7Days: { totalTokens: 29600000 },
      last24Hours: { totalTokens: 0 }
    }
  });

  const text = formatStatusBarText('CC: {cc}', summary);
  assert.equal(text, 'CC: 29.6M(7d)');
});

test('handles small token values in fallback rendering', () => {
  const summary = summarizeQuotas([], null, {
    activity: {
      last7Days: { totalTokens: 850 },
      last24Hours: { totalTokens: 0 }
    }
  });

  const text = formatStatusBarText('CC: {cc}', summary);
  assert.equal(text, 'CC: 850(7d)');
});

test('formats independently colorable status bar segments by provider', () => {
  const summary = summarizeQuotas(
    [
      { label: 'Gemini Flash', remainingPercentage: 48 },
      { label: 'GPT-OSS', modelId: 'openai-gpt', remainingPercentage: 72 },
      { label: 'Claude Sonnet', remainingPercentage: 83 }
    ],
    { models: [{ remainingPercentage: 91 }] },
    { models: [{ remainingPercentage: 64 }] }
  );

  assert.deepEqual(formatStatusBarSegments(DEFAULT_STATUS_BAR_FORMAT, summary), {
    antigravity: '$(hubot) AG(AG 48%, CX 72%, CL 83%)',
    codex: 'CX:91%',
    claudeCode: 'CC:64%'
  });
});

test('falls back to provider-separated defaults when a custom segment mixes providers', () => {
  const summary = summarizeQuotas([], null, null);
  assert.deepEqual(formatStatusBarSegments('All: {ag} / {cx} / {cc}', summary), {
    antigravity: '$(hubot) AG(AG N/A, CX N/A, CL N/A)',
    codex: 'CX:N/A',
    claudeCode: 'CC:N/A'
  });
});
