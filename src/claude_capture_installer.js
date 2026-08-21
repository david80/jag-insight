const fs = require('fs');
const os = require('os');
const path = require('path');

function buildCaptureCommand(capturePath) {
  // Forward slashes are accepted by Windows Node.js and work in both
  // PowerShell and Git Bash, which are the shells Claude Code uses there.
  const portablePath = capturePath.replace(/\\/g, '/');
  return `node ${JSON.stringify(portablePath)}`;
}

function isJagInsightsCommand(command) {
  return typeof command === 'string' && command.includes('jag-insights-statusline.js');
}

async function writeJsonAtomic(filePath, data) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await fs.promises.writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.promises.rename(temporaryPath, filePath);
}

async function installClaudeCapture(extensionPath, homeDirectory = os.homedir()) {
  const claudeDirectory = path.join(homeDirectory, '.claude');
  const settingsPath = path.join(claudeDirectory, 'settings.json');
  const capturePath = path.join(claudeDirectory, 'jag-insights-statusline.js');
  const sourcePath = path.join(extensionPath, 'resources', 'claude_statusline_capture.js');

  await fs.promises.mkdir(claudeDirectory, { recursive: true });

  let settings = {};
  let settingsExisted = false;
  try {
    settings = JSON.parse(await fs.promises.readFile(settingsPath, 'utf8'));
    settingsExisted = true;
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }

  const existingCommand = settings.statusLine && settings.statusLine.command;
  if (existingCommand && !isJagInsightsCommand(existingCommand)) {
    return {
      installed: false,
      conflict: true,
      existingCommand,
      settingsPath
    };
  }

  await fs.promises.copyFile(sourcePath, capturePath);

  if (settingsExisted && !isJagInsightsCommand(existingCommand)) {
    const backupPath = `${settingsPath}.jag-insights-backup-${Date.now()}`;
    await fs.promises.copyFile(settingsPath, backupPath);
  }

  settings.statusLine = {
    ...(settings.statusLine || {}),
    type: 'command',
    command: buildCaptureCommand(capturePath),
    refreshInterval: 30
  };
  await writeJsonAtomic(settingsPath, settings);

  return {
    installed: true,
    conflict: false,
    settingsPath,
    capturePath,
    cachePath: path.join(claudeDirectory, 'jag-insights-usage.json')
  };
}

module.exports = {
  buildCaptureCommand,
  installClaudeCapture,
  isJagInsightsCommand
};
