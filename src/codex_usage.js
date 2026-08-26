const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveUserPath } = require('./path_utils');
const { fetchCodexAppServerQuota } = require('./codex_app_server');

const LOOKBACK_DAYS = 7;
const RECENT_FILE_AGE_MS = 60 * 60 * 1000;
const TAIL_BLOCK_BYTES = 64 * 1024;

function resolveCodexHome() {
  return process.env.CODEX_HOME ? resolveUserPath(process.env.CODEX_HOME) : path.join(os.homedir(), '.codex');
}

function resolveSessionPath(customPath) {
  return customPath ? resolveUserPath(customPath) : path.join(resolveCodexHome(), 'sessions');
}

function resolveArchivePath(customPath) {
  return customPath
    ? path.join(path.dirname(resolveUserPath(customPath)), 'archived_sessions')
    : path.join(resolveCodexHome(), 'archived_sessions');
}

function dateDirectory(sessionPath, date) {
  return path.join(
    sessionPath,
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  );
}

async function collectSessionFiles(directory) {
  try {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    const candidates = entries
      .filter(entry => entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl'))
      .map(async entry => {
        const filePath = path.join(directory, entry.name);
        try {
          const stats = await fs.promises.stat(filePath);
          return { filePath, mtimeMs: stats.mtimeMs, size: stats.size };
        } catch {
          return null;
        }
      });
    return (await Promise.all(candidates)).filter(Boolean);
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function findSessionFiles(sessionPath, now, archivePath = resolveArchivePath(sessionPath)) {
  const directories = [];
  for (let daysBack = 0; daysBack < LOOKBACK_DAYS; daysBack += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - daysBack);
    directories.push(dateDirectory(sessionPath, date));
  }
  directories.push(archivePath);
  const groups = await Promise.all(directories.map(collectSessionFiles));
  return groups.flat().sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function findTokenCountInLines(lines) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      const record = JSON.parse(line);
      if (record.type === 'event_msg' && record.payload && record.payload.type === 'token_count') return record;
    } catch {
      // A boundary or final line can be incomplete while Codex is writing.
    }
  }
  return null;
}

async function parseLatestTokenCount(filePath) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const stats = await handle.stat();
    let position = stats.size;
    let suffix = '';
    while (position > 0) {
      const length = Math.min(TAIL_BLOCK_BYTES, position);
      position -= length;
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      const text = buffer.subarray(0, bytesRead).toString('utf8') + suffix;
      const lines = text.split('\n');
      suffix = position > 0 ? lines.shift() || '' : '';
      const found = findTokenCountInLines(lines);
      if (found) return found;
    }
    return suffix ? findTokenCountInLines([suffix]) : null;
  } catch {
    return null;
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

async function findLatestTokenCount(sessionPath, now = new Date()) {
  const archivePath = resolveArchivePath(sessionPath);
  const files = await findSessionFiles(sessionPath, now, archivePath);
  const recentCutoff = now.getTime() - RECENT_FILE_AGE_MS;
  const todayPath = dateDirectory(sessionPath, now);
  const recentToday = files.filter(file => path.dirname(file.filePath) === todayPath && file.mtimeMs >= recentCutoff);
  const recentPaths = new Set(recentToday.map(file => file.filePath));
  const fallback = files.filter(file => !recentPaths.has(file.filePath));

  for (const candidate of [...recentToday, ...fallback]) {
    const record = await parseLatestTokenCount(candidate.filePath);
    if (record) return { filePath: candidate.filePath, record };
  }
  return null;
}

function limitLabel(windowMinutes, index) {
  if (windowMinutes === 300) return '5-Hour Limit';
  if (windowMinutes === 10080) return 'Weekly Limit';
  if (windowMinutes > 0 && windowMinutes % 10080 === 0) return `${windowMinutes / 10080}-Week Limit`;
  if (windowMinutes > 0 && windowMinutes % 1440 === 0) return `${windowMinutes / 1440}-Day Limit`;
  if (windowMinutes > 0 && windowMinutes % 60 === 0) return `${windowMinutes / 60}-Hour Limit`;
  if (windowMinutes > 0) return `${windowMinutes}-Minute Limit`;
  return index === 0 ? 'Primary Limit' : 'Secondary Limit';
}

function resetTimestamp(limit, recordTimestamp) {
  if (limit.resets_at !== null && limit.resets_at !== undefined && Number.isFinite(Number(limit.resets_at))) {
    return new Date(Number(limit.resets_at) * 1000);
  }
  if (limit.resets_in_seconds !== null && limit.resets_in_seconds !== undefined
      && Number.isFinite(Number(limit.resets_in_seconds))) {
    return new Date(recordTimestamp.getTime() + Number(limit.resets_in_seconds) * 1000);
  }
  return null;
}

function parseRateLimitRecord(record, filePath, now = new Date()) {
  const rateLimits = record && record.payload && record.payload.rate_limits;
  if (!rateLimits) return null;
  const recordTimestamp = new Date(record.timestamp);
  const limits = [rateLimits.primary, rateLimits.secondary].filter(Boolean);
  const models = limits.map((limit, index) => {
    const usedPercentage = Math.max(0, Math.min(100, Number(limit.used_percent) || 0));
    const windowMinutes = Number(limit.window_minutes) || 0;
    const resetTime = resetTimestamp(limit, recordTimestamp);
    return {
      label: limitLabel(windowMinutes, index),
      remainingPercentage: 100 - usedPercentage,
      usedPercentage,
      windowMinutes,
      resetsAt: resetTime && !Number.isNaN(resetTime.getTime()) ? resetTime.toISOString() : null,
      isOutdated: Boolean(resetTime && resetTime.getTime() < now.getTime())
    };
  });
  if (models.length === 0) return null;
  return {
    source: 'codex-sessions',
    sessionFile: filePath,
    timestamp: Number.isNaN(recordTimestamp.getTime()) ? null : recordTimestamp.toISOString(),
    planType: rateLimits.plan_type || null,
    models
  };
}

async function readCodexQuota(customPath, options = {}) {
  if (options.useAppServer) {
    try {
      const quota = await fetchCodexAppServerQuota({
        command: options.appServerCommand || 'codex',
        timeoutMs: options.timeoutMs || 6000
      });
      if (quota) return quota;
    } catch {
      // The documented app-server integration is optional; local sessions remain the fallback.
    }
  }
  try {
    const sessionPath = resolveSessionPath(customPath);
    const result = await findLatestTokenCount(sessionPath);
    return result ? parseRateLimitRecord(result.record, result.filePath) : null;
  } catch {
    return null;
  }
}

module.exports = {
  readCodexQuota,
  parseRateLimitRecord,
  parseLatestTokenCount,
  findLatestTokenCount,
  resolveSessionPath,
  resolveArchivePath
};
