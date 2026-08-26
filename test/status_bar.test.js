const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

const createdItems = [];
const originalLoad = Module._load;
Module._load = function loadWithVscodeStub(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      StatusBarAlignment: { Right: 2 },
      ThemeColor: class ThemeColor {
        constructor(id) {
          this.id = id;
        }
      },
      MarkdownString: class MarkdownString {
        constructor() { this.markdown = ''; }
        appendMarkdown(value) { this.markdown += value; return this; }
        appendCodeblock(value) { this.markdown += value; return this; }
      },
      window: {
        createStatusBarItem: () => {
          const item = {
            visible: false,
            show() { this.visible = true; },
            hide() { this.visible = false; },
            dispose() {}
          };
          createdItems.push(item);
          return item;
        }
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const StatusBarManager = require('../src/status_bar');
Module._load = originalLoad;

test('tooltip quota groups follow the AG(AG, CX, CL) | CX | CC status bar order', () => {
  const manager = new StatusBarManager();
  const models = [
    { label: 'Claude Sonnet', remainingPercentage: 83, timeUntilResetFormatted: '1h' },
    { label: 'GPT-OSS', modelId: 'openai-gpt', remainingPercentage: 72, timeUntilResetFormatted: '2h' },
    { label: 'Gemini Flash', remainingPercentage: 48, timeUntilResetFormatted: '3h' }
  ];
  const codexQuota = {
    source: 'codex-sessions',
    models: [{ label: 'Weekly Limit', remainingPercentage: 91, resetsAt: null }]
  };
  const claudeCodeQuota = {
    source: 'claude-usage-cache',
    models: [{ label: '7-Day Limit', remainingPercentage: 64, resetsAt: null }],
    activity: {
      last24Hours: { totalTokens: 1000, turns: 2 },
      last7Days: { totalTokens: 7000, turns: 14 }
    }
  };

  const tooltip = manager.buildQuotaTable(models, claudeCodeQuota, codexQuota, null);
  const headings = [
    'AG · AG (Gemini)',
    'AG · CX (Codex)',
    'AG · CC (Claude Code)',
    'CX · Codex [sessions]',
    'CC · Claude Code [official]'
  ];

  for (const heading of headings) {
    assert.match(tooltip, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (let index = 1; index < headings.length; index += 1) {
    assert.ok(
      tooltip.indexOf(headings[index - 1]) < tooltip.indexOf(headings[index]),
      `${headings[index - 1]} should appear before ${headings[index]}`
    );
  }
  assert.doesNotMatch(tooltip, /Claude Code Activity/);
  assert.doesNotMatch(tooltip, /Last 24 Hours/);
});

test('applies warning and error colors independently to AG, CX, and CC items', () => {
  const manager = new StatusBarManager();
  manager.update(
    {
      timestamp: '2026-08-21T00:00:00.000Z',
      models: [
        { label: 'Gemini Flash', remainingPercentage: 20, timeUntilResetFormatted: '1h' }
      ]
    },
    {
      enabled: true,
      showQuotaOnStatusBar: true,
      showUserEmail: false,
      showPromptCredits: false
    },
    {
      source: 'claude-usage-cache',
      models: [{ label: '7-Day Limit', remainingPercentage: 80, resetsAt: null }]
    },
    {
      source: 'codex-sessions',
      models: [{ label: 'Weekly Limit', remainingPercentage: 0, resetsAt: null }]
    },
    null
  );

  assert.equal(manager.items.antigravity.text, '$(hubot) AG(AG 20%, Codex N/A, CloudCode N/A)');
  assert.equal(manager.items.codex.text, 'Codex:0%');
  assert.equal(manager.items.claudeCode.text, 'CloudCode:80%');
  assert.equal(manager.items.antigravity.backgroundColor.id, 'statusBarItem.warningBackground');
  assert.equal(manager.items.codex.backgroundColor.id, 'statusBarItem.errorBackground');
  assert.equal(manager.items.claudeCode.backgroundColor, undefined);
  assert.equal(manager.items.antigravity.visible, true);
  assert.equal(manager.items.codex.visible, true);
  assert.equal(manager.items.claudeCode.visible, true);
});

test('hides every provider item when the extension is disabled', () => {
  const manager = new StatusBarManager();
  for (const item of Object.values(manager.items)) item.show();

  manager.update(null, { enabled: false }, null, null, null);

  for (const item of Object.values(manager.items)) assert.equal(item.visible, false);
});

test('limits trusted tooltip commands and escapes external identity text', () => {
  const manager = new StatusBarManager();
  const tooltip = manager.buildTooltip({
    timestamp: '2026-08-25T00:00:00.000Z',
    email: 'person` [run](command:evil)',
    models: []
  }, {
    showUserEmail: true,
    showPromptCredits: false
  });

  assert.deepEqual(tooltip.isTrusted.enabledCommands, [
    'jagInsights.refresh',
    'workbench.action.openSettings'
  ]);
  assert.equal(tooltip.supportHtml, false);
  assert.match(tooltip.markdown, /person\\` \\\[run\\\]\\\(command:evil\\\)/);
});
