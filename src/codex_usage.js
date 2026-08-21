const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveUserPath } = require('./path_utils');

const LOOKBACK_DAYS = 7;
const RECENT_FILE_AGE_MS = 60 * 60 * 1000;

function resolveSessionPath(customPath) {
  if (!customPath) {
    const codexHome = process.env.CODEX_HOME
      ? resolveUserPath(process.env.CODEX_HOME)
      : path.join(os.homedir(), '.codex');
    return path.join(codexHome, 'sessions');
  }

  return resolveUserPath(customPath);
}

function dateDirectory(sessionPath, date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return path.join(sessionPath, year, month, day);
}

async function collectSessionFiles(directory) {
  try {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith('rollout-') || !entry.name.endsWith('.jsonl')) {
        continue;
      }

      const filePath = path.join(directory, entry.name);
      try {
        const stats = await fs.promises.stat(filePath);
        files.push({ filePath, mtimeMs: stats.mtimeMs });
      } catch {
        // A session can disappear while Codex rotates it. Ignore and continue.
      }
    }

    return files;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function findSessionFiles(sessionPath, now) {
  const files = [];

  for (let daysBack = 0; daysBack < LOOKBACK_DAYS; daysBack += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - daysBack);
    files.push(...await collectSessionFiles(dateDirectory(sessionPath, date)));
  }

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

async function parseLatestTokenCount(filePath) {
  let content;
  try {
    content = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return null;
  }

  const lines = content.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) continue;

    try {
      const record = JSON.parse(line);
      if (record.type === 'event_msg' && record.payload && record.payload.type === 'token_count') {
        return record;
      }
    } catch {
      // Skip incomplete or malformed JSONL records.
    }
  }

  return null;
}

async function findLatestTokenCount(sessionPath, now = new Date()) {
  const files = await findSessionFiles(sessionPath, now);
  const recentCutoff = now.getTime() - RECENT_FILE_AGE_MS;
  const todayPath = dateDirectory(sessionPath, now);

  const recentToday = files.filter(({ filePath, mtimeMs }) =>
    path.dirname(filePath) === todayPath && mtimeMs >= recentCutoff
  );
  const fallback = files.filter(candidate => !recentToday.includes(candidate));

  for (const candidate of [...recentToday, ...fallback]) {
    const record = await parseLatestTokenCount(candidate.filePath);
    if (record) {
      return { filePath: candidate.filePath, record };
    }
  }

  return null;
}

function limitLabel(windowMinutes, index) {
  if (windowMinutes === 300) return '5-Hour Limit';
  if (windowMinutes === 10080) return 'Weekly Limit';
  if (windowMinutes > 0 && windowMinutes % 10080 === 0) {
    const weeks = windowMinutes / 10080;
    return `${weeks}-Week Limit`;
  }
  if (windowMinutes > 0 && windowMinutes % 1440 === 0) {
    const days = windowMinutes / 1440;
    return `${days}-Day Limit`;
  }
  if (windowMinutes > 0 && windowMinutes % 60 === 0) {
    const hours = windowMinutes / 60;
    return `${hours}-Hour Limit`;
  }
  if (windowMinutes > 0) return `${windowMinutes}-Minute Limit`;
  return index === 0 ? 'Primary Limit' : 'Secondary Limit';
}

function resetTimestamp(limit, recordTimestamp) {
  if (limit.resets_at !== null && limit.resets_at !== undefined && Number.isFinite(Number(limit.resets_at))) {
    return new Date(Number(limit.resets_at) * 1000);
  }

  if (limit.resets_in_seconds !== null && limit.resets_in_seconds !== undefined && Number.isFinite(Number(limit.resets_in_seconds))) {
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
      remainingPercentage: Math.max(0, 100 - usedPercentage),
      usedPercentage,
      windowMinutes,
      resetsAt: resetTime ? resetTime.toISOString() : null,
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

async function readCodexQuota(customPath) {
  try {
    const sessionPath = resolveSessionPath(customPath);
    const result = await findLatestTokenCount(sessionPath);
    if (!result) return null;
    return parseRateLimitRecord(result.record, result.filePath);
  } catch {
    return null;
  }
}

module.exports = {
  readCodexQuota,
  parseRateLimitRecord,
  resolveSessionPath
};
