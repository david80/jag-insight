const fs = require('fs');
const path = require('path');
const os = require('os');

let logFile = path.join(os.homedir(), '.jag-insights', 'daemon.log');

function setStorageDirectory(directory) {
  if (!directory) return;
  fs.mkdirSync(directory, { recursive: true });
  logFile = path.join(directory, 'daemon.log');
}

function formatMessage(level, context, message, meta) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] [${context}] ${message}${metaStr}`;
}

function writeLog(level, context, message, meta) {
  const formatted = formatMessage(level, context, message, meta);
  
  // Console logging
  if (level === 'ERROR') {
    console.error(formatted);
  } else {
    console.log(formatted);
  }

  // File logging
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, formatted + '\n', 'utf8');
  } catch (err) {
    console.error(`Failed to write to log file: ${err.message}`);
  }
}

module.exports = {
  setStorageDirectory,
  info: (context, message, meta) => writeLog('INFO', context, message, meta),
  debug: (context, message, meta) => writeLog('DEBUG', context, message, meta),
  error: (context, message, meta) => writeLog('ERROR', context, message, meta)
};
