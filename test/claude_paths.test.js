const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  defaultClaudeConfigDirectories,
  defaultClaudeTranscriptRoots,
  defaultClaudeQuotaPaths
} = require('../src/claude_paths');

test('discovers active, legacy, and XDG-style Claude data locations', t => {
  const previous = process.env.CLAUDE_CONFIG_DIR;
  const configured = path.join(os.tmpdir(), 'jag-custom-claude');
  process.env.CLAUDE_CONFIG_DIR = configured;
  t.after(() => {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
  });

  const directories = defaultClaudeConfigDirectories();
  const roots = defaultClaudeTranscriptRoots();
  const quotaPaths = defaultClaudeQuotaPaths();

  assert.equal(directories[0], configured);
  assert.ok(directories.includes(path.join(os.homedir(), '.claude')));
  assert.ok(directories.includes(path.join(os.homedir(), '.config', 'claude')));
  assert.ok(roots.includes(path.join(configured, 'projects')));
  assert.ok(quotaPaths.includes(path.join(configured, 'usage-limits.json')));
});
