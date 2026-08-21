const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { resolveUserPath } = require('../src/path_utils');

test('expands tilde paths written with POSIX or Windows separators', () => {
  const expected = path.join(os.homedir(), '.claude', 'usage.json');
  assert.equal(resolveUserPath('~/.claude/usage.json'), expected);
  assert.equal(resolveUserPath('~\\.claude\\usage.json'), expected);
});

test('resolves the home directory itself', () => {
  assert.equal(resolveUserPath('~'), os.homedir());
});
