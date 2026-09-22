const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_STATUS_BAR_FORMAT,
  summarizeQuotas,
  formatStatusBarText,
  formatStatusBarSegments
} = require('../src/status_summary');

// Each segment matches the number its own tool shows: Antigravity counts down,
// while `/usage` and the Codex rate-limit output count up.
test('separates Antigravity provider quotas from external Codex and Claude Code', () => {
  const models = [
    { label: 'Gemini 3.5 Flash', modelId: 'gemini', remainingPercentage: 48 },
    { label: 'GPT-OSS 120B', modelId: 'MODEL_OPENAI_GPT_OSS', remainingPercentage: 72 },
    { label: 'Claude Sonnet', modelId: 'claude', remainingPercentage: 83 }
  ];
  const codexQuota = { models: [{ usedPercentage: 9, remainingPercentage: 91 }] };
  const claudeCodeQuota = { models: [{ usedPercentage: 36, remainingPercentage: 64 }] };

  const summary = summarizeQuotas(models, codexQuota, claudeCodeQuota);
  const text = formatStatusBarText(DEFAULT_STATUS_BAR_FORMAT, summary);

  assert.equal(text, '$(hubot) AG(Gemini 48%, Codex 72%, Claude 83%) | Codex:9% | Claude Code:36%');
});

test('shows Claude Code session, weekly, and model limits together', () => {
  const summary = summarizeQuotas([], null, {
    models: [
      { label: '5-Hour Limit', usedPercentage: 10, remainingPercentage: 90 },
      { label: 'Weekly Limit', usedPercentage: 40, remainingPercentage: 60 },
      { label: 'Weekly Fable Limit', usedPercentage: 41, remainingPercentage: 59 }
    ]
  });

  assert.equal(summary.claudeCode, 41);
  assert.equal(formatStatusBarText('Claude Code:{cc}', summary), 'Claude Code:5h 10% · 7d 40% · Fable 41%');
});

// The most consumed window is also the one with the least left, so Antigravity
// picks the same window and only the printed direction differs.
test('reports the same worst window as remaining quota for Antigravity', () => {
  const summary = summarizeQuotas([
    { label: 'Gemini Flash', remainingPercentage: 80 },
    { label: 'Gemini Pro', remainingPercentage: 12 }
  ], null, null);

  assert.equal(summary.antigravity, 88);
  assert.equal(formatStatusBarText('AG:{ag}', summary), 'AG:12%');
});

test('ignores N/A and outdated windows when summarizing usage', () => {
  const summary = summarizeQuotas([], null, {
    models: [
      { label: 'Stale Limit', usedPercentage: 100, isOutdated: true },
      { label: 'Unknown Limit', isNA: true, remainingPercentage: 0 },
      { label: '5-Hour Limit', usedPercentage: 41, remainingPercentage: 59 }
    ]
  });

  assert.equal(summary.claudeCode, 41);
});

test('does not display stale provider percentages as current usage', () => {
  const staleCodex = {
    health: { status: 'stale' },
    models: [{ label: 'Weekly Limit', usedPercentage: 96 }]
  };
  const freshClaude = {
    health: { status: 'fresh' },
    models: [{ label: '5-Hour Limit', usedPercentage: 1 }]
  };
  const summary = summarizeQuotas([], staleCodex, freshClaude);

  assert.equal(formatStatusBarText('Codex:{cx} | Claude Code:{cc}', summary),
    'Codex:N/A | Claude Code:5h 1%');
});

test('shows a stale Claude Code cache percentage ahead of transcript tokens', () => {
  const summary = summarizeQuotas([], null, {
    health: { status: 'stale' },
    models: [
      { label: '5-Hour Limit', usedPercentage: 1 },
      { label: 'Weekly Limit', usedPercentage: 38 }
    ],
    activity: { available: true, last7Days: { totalTokens: 22700000 } }
  });

  assert.equal(formatStatusBarText('Claude Code:{cc}', summary), 'Claude Code:5h 1% · 7d 38%');
});

test('uses another valid Claude Code window when five-hour usage is unavailable', () => {
  const summary = summarizeQuotas([], null, {
    models: [
      { label: '5-Hour Limit', usedPercentage: 1, resetsAt: '2020-01-01T00:00:00.000Z' },
      { label: 'Weekly Limit', usedPercentage: 38 }
    ]
  });

  assert.equal(formatStatusBarText('Claude Code:{cc}', summary), 'Claude Code:7d 38%');
});

test('falls back to transcript tokens after the cached Claude Code window expires', () => {
  const summary = summarizeQuotas([], null, {
    health: { status: 'stale' },
    models: [{ label: 'Weekly Limit', usedPercentage: 38, resetsAt: '2020-01-01T00:00:00.000Z' }],
    activity: { available: true, last7Days: { totalTokens: 22700000 } }
  });

  assert.equal(formatStatusBarText('Claude Code:{cc}', summary), 'Claude Code:22.7M(7d)');
});

test('keeps the legacy local Claude placeholder working and supports agcc', () => {
  const summary = summarizeQuotas([
    { label: 'Claude Opus', remainingPercentage: 55 }
  ], null, null);

  assert.equal(formatStatusBarText('CL: {cl}', summary), 'CL: 55%');
  assert.equal(formatStatusBarText('AGCC: {agcc}', summary), 'AGCC: 55%');
});

test('falls back to Claude Code token usage rendering when rate limit percentage is missing', () => {
  const summary = summarizeQuotas([], null, {
    activity: {
      last7Days: { totalTokens: 29600000 },
      last24Hours: { totalTokens: 0 }
    }
  });

  const text = formatStatusBarText('Claude Code: {cc}', summary);
  assert.equal(text, 'Claude Code: 29.6M(7d)');
});

test('handles small token values in fallback rendering', () => {
  const summary = summarizeQuotas([], null, {
    activity: {
      last7Days: { totalTokens: 850 },
      last24Hours: { totalTokens: 0 }
    }
  });

  const text = formatStatusBarText('Claude Code: {cc}', summary);
  assert.equal(text, 'Claude Code: 850(7d)');
});

test('distinguishes no recent Claude Code activity from unavailable data', () => {
  const idle = summarizeQuotas([], null, {
    activity: {
      available: true,
      last7Days: { totalTokens: 0 }
    }
  });
  const unavailable = summarizeQuotas([], null, {
    activity: {
      available: false,
      last7Days: { totalTokens: 0 }
    }
  });

  assert.equal(formatStatusBarText('Claude Code:{cc}', idle), 'Claude Code:0(7d)');
  assert.equal(formatStatusBarText('Claude Code:{cc}', unavailable), 'Claude Code:N/A');
});

test('formats independently colorable status bar segments by provider', () => {
  const summary = summarizeQuotas(
    [
      { label: 'Gemini Flash', remainingPercentage: 48 },
      { label: 'GPT-OSS', modelId: 'openai-gpt', remainingPercentage: 72 },
      { label: 'Claude Sonnet', remainingPercentage: 83 }
    ],
    { models: [{ usedPercentage: 9 }] },
    { models: [{ usedPercentage: 36 }] }
  );

  assert.deepEqual(formatStatusBarSegments(DEFAULT_STATUS_BAR_FORMAT, summary), {
    antigravity: '$(hubot) AG(Gemini 48%, Codex 72%, Claude 83%)',
    codex: 'Codex:9%',
    claudeCode: 'Claude Code:36%'
  });
});

test('falls back to provider-separated defaults when a custom segment mixes providers', () => {
  const summary = summarizeQuotas([], null, null);
  assert.deepEqual(formatStatusBarSegments('All: {ag} / {cx} / {cc}', summary), {
    antigravity: '$(hubot) AG(Gemini N/A, Codex N/A, Claude N/A)',
    codex: 'Codex:N/A',
    claudeCode: 'Claude Code:N/A'
  });
});
