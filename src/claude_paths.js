const os = require('os');
const path = require('path');
const { resolveUserPath } = require('./path_utils');

function uniquePaths(paths) {
  return [...new Set(paths.filter(Boolean).map(candidate => path.resolve(candidate)))];
}

function defaultClaudeConfigDirectories() {
  const configured = resolveUserPath(process.env.CLAUDE_CONFIG_DIR || '');
  return uniquePaths([
    configured,
    path.join(os.homedir(), '.claude'),
    path.join(os.homedir(), '.config', 'claude')
  ]);
}

function defaultClaudeTranscriptRoots() {
  return uniquePaths([
    ...defaultClaudeConfigDirectories().map(directory => path.join(directory, 'projects')),
    path.join(
      os.homedir(), 'Library', 'Developer', 'Xcode', 'CodingAssistant',
      'ClaudeAgentConfig', 'projects'
    )
  ]);
}

function defaultClaudeQuotaPaths() {
  const names = [
    'jag-insights-usage.json',
    'usage-limits.json',
    'usage-exact.json'
  ];
  return uniquePaths(defaultClaudeConfigDirectories().flatMap(directory => (
    names.map(name => path.join(directory, name))
  )));
}

module.exports = {
  defaultClaudeConfigDirectories,
  defaultClaudeTranscriptRoots,
  defaultClaudeQuotaPaths
};
