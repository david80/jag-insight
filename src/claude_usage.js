const fs = require('fs');
const { resolveUserPath } = require('./path_utils');
const { defaultClaudeQuotaPaths } = require('./claude_paths');

function resolveHomePath(filePath) {
  return resolveUserPath(filePath);
}

function usedPercentage(limit, utilizationIsPercent = false) {
  if (!limit) return null;
  if (limit.used_percentage !== null && limit.used_percentage !== undefined && Number.isFinite(Number(limit.used_percentage))) {
    return Number(limit.used_percentage);
  }
  if (limit.used_percent !== null && limit.used_percent !== undefined && Number.isFinite(Number(limit.used_percent))) {
    return Number(limit.used_percent);
  }
  if (limit.percent !== null && limit.percent !== undefined && Number.isFinite(Number(limit.percent))) {
    return Number(limit.percent);
  }
  if (limit.utilization !== null && limit.utilization !== undefined && Number.isFinite(Number(limit.utilization))) {
    const utilization = Number(limit.utilization);
    return utilizationIsPercent ? utilization : utilization <= 1 ? utilization * 100 : utilization;
  }
  return null;
}

function resetIso(limit) {
  if (!limit || limit.resets_at === null || limit.resets_at === undefined) return null;
  const raw = limit.resets_at;
  const date = typeof raw === 'number' || /^\d+(\.\d+)?$/.test(String(raw))
    ? new Date(Number(raw) > 100000000000 ? Number(raw) : Number(raw) * 1000)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseWindow(limit, label, now, utilizationIsPercent = false) {
  const used = usedPercentage(limit, utilizationIsPercent);
  if (used === null) return null;
  const boundedUsed = Math.max(0, Math.min(100, used));
  const resetsAt = resetIso(limit);

  return {
    label,
    usedPercentage: boundedUsed,
    remainingPercentage: 100 - boundedUsed,
    resetsAt,
    isOutdated: Boolean(resetsAt && new Date(resetsAt).getTime() < now.getTime())
  };
}

function parseClaudeUsage(data, sourcePath, now = new Date()) {
  if (!data) return null;
  // Recent Claude Code builds keep the same utilization data used by /usage
  // in ~/.claude.json. This gives us an official percentage even when the
  // optional statusLine capture has not produced its cache yet.
  const localCache = data.cachedUsageUtilization;
  const limits = data.rate_limits
    || data.rateLimits
    || (localCache && localCache.utilization)
    || data;
  // cachedUsageUtilization in ~/.claude.json stores utilization in percent
  // units (1 means 1%), while some other sources use fractions (1 means 100%).
  const utilizationIsPercent = Boolean(localCache && limits === localCache.utilization);
  const models = [];

  const fiveHour = parseWindow(limits.five_hour || limits.fiveHour, '5-Hour Limit', now, utilizationIsPercent);
  if (fiveHour) models.push(fiveHour);

  const sevenDay = parseWindow(limits.seven_day || limits.sevenDay, 'Weekly Limit', now, utilizationIsPercent);
  if (sevenDay) models.push(sevenDay);

  for (const [name, limit] of Object.entries(limits)) {
    if (!name.startsWith('seven_day_')) continue;
    const scope = name.slice('seven_day_'.length)
      .split('_')
      .filter(Boolean)
      .map(part => part.toLowerCase() === 'oauth' ? 'OAuth' : `${part[0].toUpperCase()}${part.slice(1)}`)
      .join(' ');
    const scoped = parseWindow(limit, `Weekly ${scope} Limit`, now, utilizationIsPercent);
    if (scoped) models.push(scoped);
  }

  // Newer Claude Code caches expose the same rows as /usage in a limits list.
  // Model-specific rows can exist here even when seven_day_<model> is null.
  for (const limit of Array.isArray(limits.limits) ? limits.limits : []) {
    let label;
    if (limit.kind === 'session') label = '5-Hour Limit';
    else if (limit.kind === 'weekly_all') label = 'Weekly Limit';
    else if (limit.kind === 'weekly_scoped') {
      const modelName = limit.scope && limit.scope.model && limit.scope.model.display_name;
      if (typeof modelName !== 'string' || !modelName.trim()) continue;
      label = `Weekly ${modelName.trim()} Limit`;
    } else continue;

    const parsed = parseWindow(limit, label, now, true);
    if (!parsed) continue;
    const existingIndex = models.findIndex(model => model.label === label);
    if (existingIndex === -1) models.push(parsed);
    else models[existingIndex] = parsed;
  }

  if (models.length === 0) return null;
  return {
    source: data.source || (localCache ? 'claude-local-cache' : 'claude-usage-cache'),
    sourcePath,
    timestamp: data.timestamp
      || (localCache && Number.isFinite(Number(localCache.fetchedAtMs))
        ? new Date(Number(localCache.fetchedAtMs)).toISOString()
        : null),
    models
  };
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readClaudeQuota(customPath, legacyPath) {
  const candidates = [
    customPath,
    ...defaultClaudeQuotaPaths(),
    '~/.claude.json',
    legacyPath,
    '~/.claude-monitor/state/latest.json'
  ];
  const checked = new Set();
  let staleQuota = null;

  for (const candidate of candidates) {
    const resolvedPath = resolveHomePath(candidate);
    if (!resolvedPath || checked.has(resolvedPath)) continue;
    checked.add(resolvedPath);
    const parsed = parseClaudeUsage(await readJson(resolvedPath), resolvedPath);
    if (!parsed) continue;
    if (parsed.models.some(model => !model.isOutdated)) return parsed;
    staleQuota = staleQuota || parsed;
  }

  return staleQuota;
}

module.exports = {
  parseClaudeUsage,
  readClaudeQuota,
  resolveHomePath,
  defaultClaudeQuotaPaths
};
