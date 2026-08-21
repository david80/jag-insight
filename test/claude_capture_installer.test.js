const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildCaptureCommand, installClaudeCapture } = require('../src/claude_capture_installer');

const extensionPath = path.resolve(__dirname, '..');

test('installs the Claude usage capture without removing existing settings', async t => {
  const homeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jag-claude-install-'));
  t.after(() => fs.rmSync(homeDirectory, { recursive: true, force: true }));
  const claudeDirectory = path.join(homeDirectory, '.claude');
  fs.mkdirSync(claudeDirectory);
  fs.writeFileSync(path.join(claudeDirectory, 'settings.json'), JSON.stringify({ effortLevel: 'high' }));

  const result = await installClaudeCapture(extensionPath, homeDirectory);
  const settings = JSON.parse(fs.readFileSync(result.settingsPath, 'utf8'));

  assert.equal(result.installed, true);
  assert.equal(settings.effortLevel, 'high');
  assert.equal(settings.statusLine.command, buildCaptureCommand(result.capturePath));
  assert.equal(fs.existsSync(result.capturePath), true);
});

test('builds a quoted Claude capture command with portable separators', () => {
  assert.equal(
    buildCaptureCommand('C:\\Users\\Jane Doe\\.claude\\jag-insights-statusline.js'),
    'node "C:/Users/Jane Doe/.claude/jag-insights-statusline.js"'
  );
});

test('does not overwrite an unrelated Claude statusLine command', async t => {
  const homeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'jag-claude-conflict-'));
  t.after(() => fs.rmSync(homeDirectory, { recursive: true, force: true }));
  const claudeDirectory = path.join(homeDirectory, '.claude');
  fs.mkdirSync(claudeDirectory);
  fs.writeFileSync(path.join(claudeDirectory, 'settings.json'), JSON.stringify({
    statusLine: { type: 'command', command: '~/.claude/my-statusline.sh' }
  }));

  const result = await installClaudeCapture(extensionPath, homeDirectory);

  assert.equal(result.conflict, true);
  assert.equal(fs.existsSync(path.join(claudeDirectory, 'jag-insights-statusline.js')), false);
});
