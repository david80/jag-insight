const fs = require('fs');
const path = require('path');
const os = require('os');

let logFile = path.join(os.homedir(), '.jag-insights', 'daemon.log');
const MAX_LOG_BYTES = 1024 * 1024;
const MAX_BACKUPS = 3;
const SENSITIVE_KEY = /email|token|secret|authorization|credential/i;

function setStorageDirectory(directory) {
  if (!directory) return;
  fs.mkdirSync(directory, { recursive: true });
  logFile = path.join(directory, 'daemon.log');
}

function formatMessage(level, context, message, meta) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(redact(meta))}` : '';
  return `[${timestamp}] [${level}] [${context}] ${message}${metaStr}`;
}

function redact(value, key = '') {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  }
  return value;
}

function rotateIfNeeded() {
  let size = 0;
  try { size = fs.statSync(logFile).size; } catch { return; }
  if (size < MAX_LOG_BYTES) return;
  const oldest = `${logFile}.${MAX_BACKUPS}`;
  if (fs.existsSync(oldest)) fs.unlinkSync(oldest);
  for (let index = MAX_BACKUPS - 1; index >= 1; index -= 1) {
    const source = `${logFile}.${index}`;
    const target = `${logFile}.${index + 1}`;
    if (fs.existsSync(source)) fs.renameSync(source, target);
  }
  fs.renameSync(logFile, `${logFile}.1`);
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
    rotateIfNeeded();
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

module.exports.redact = redact;
