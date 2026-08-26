const { spawn } = require('child_process');
const { version } = require('../package.json');

let cachedQuota = null;
let cachedAt = 0;

function limitLabel(windowMinutes, fallback) {
  if (windowMinutes === 300) return '5-Hour Limit';
  if (windowMinutes === 10080) return 'Weekly Limit';
  if (windowMinutes > 0 && windowMinutes % 1440 === 0) return `${windowMinutes / 1440}-Day Limit`;
  if (windowMinutes > 0 && windowMinutes % 60 === 0) return `${windowMinutes / 60}-Hour Limit`;
  if (windowMinutes > 0) return `${windowMinutes}-Minute Limit`;
  return fallback;
}

function parseCodexAppServerRateLimits(result, now = new Date()) {
  if (!result || typeof result !== 'object') return null;
  const buckets = result.rateLimitsByLimitId && Object.keys(result.rateLimitsByLimitId).length > 0
    ? Object.values(result.rateLimitsByLimitId)
    : (result.rateLimits ? [result.rateLimits] : []);
  const multipleBuckets = buckets.length > 1;
  const models = [];

  for (const bucket of buckets) {
    const bucketName = bucket.limitName || bucket.limitId || 'Codex';
    for (const [position, window] of [['Primary Limit', bucket.primary], ['Secondary Limit', bucket.secondary]]) {
      if (!window) continue;
      const usedPercentage = Math.max(0, Math.min(100, Number(window.usedPercent) || 0));
      const windowMinutes = Number(window.windowDurationMins) || 0;
      const resetTime = Number.isFinite(Number(window.resetsAt))
        ? new Date(Number(window.resetsAt) * 1000)
        : null;
      const baseLabel = limitLabel(windowMinutes, position);
      models.push({
        label: multipleBuckets ? `${bucketName} · ${baseLabel}` : baseLabel,
        remainingPercentage: 100 - usedPercentage,
        usedPercentage,
        windowMinutes,
        resetsAt: resetTime && !Number.isNaN(resetTime.getTime()) ? resetTime.toISOString() : null,
        isOutdated: Boolean(resetTime && resetTime.getTime() < now.getTime()),
        limitId: bucket.limitId || null,
        planType: bucket.planType || null
      });
    }
  }
  if (models.length === 0) return null;
  return {
    source: 'codex-app-server',
    timestamp: now.toISOString(),
    planType: buckets.find(bucket => bucket.planType)?.planType || null,
    models
  };
}

function fetchCodexAppServerQuota(options = {}) {
  const command = options.command || 'codex';
  const timeoutMs = options.timeoutMs || 6000;
  const spawnImpl = options.spawnImpl || spawn;
  const maxAgeMs = options.maxAgeMs === undefined ? 60000 : options.maxAgeMs;
  if (spawnImpl === spawn && cachedQuota && Date.now() - cachedAt < maxAgeMs) {
    return Promise.resolve(cachedQuota);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let initialized = false;
    let pending = '';
    const child = spawnImpl(command, ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
      env: process.env
    });

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch {}
      if (error) reject(error);
      else {
        if (spawnImpl === spawn) {
          cachedQuota = value;
          cachedAt = Date.now();
        }
        resolve(value);
      }
    };
    const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
    const timer = setTimeout(() => finish(new Error('Codex app-server timeout')), timeoutMs);

    child.on('error', error => finish(error));
    child.stdin.on('error', error => finish(error));
    child.stdout.on('error', error => finish(error));
    child.on('exit', code => {
      if (!settled) finish(new Error(`Codex app-server exited before replying (${code})`));
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      pending += chunk;
      let newlineIndex;
      while ((newlineIndex = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newlineIndex).trim();
        pending = pending.slice(newlineIndex + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1) {
          if (message.error) return finish(new Error(message.error.message || 'Codex initialization failed'));
          if (!initialized) {
            initialized = true;
            send({ method: 'initialized' });
            send({ method: 'account/rateLimits/read', id: 2 });
          }
        } else if (message.id === 2) {
          if (message.error) return finish(new Error(message.error.message || 'Codex rate-limit request failed'));
          const parsed = parseCodexAppServerRateLimits(message.result);
          return parsed
            ? finish(null, parsed)
            : finish(new Error('Codex app-server returned no rate limits'));
        }
      }
    });

    send({
      method: 'initialize',
      id: 1,
      params: {
        clientInfo: { name: 'jag_insights', title: 'JAG Insights', version }
      }
    });
  });
}

module.exports = { fetchCodexAppServerQuota, parseCodexAppServerRateLimits };
