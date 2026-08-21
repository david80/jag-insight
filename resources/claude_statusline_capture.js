#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', async () => {
  try {
    const data = JSON.parse(input);
    const rateLimits = data.rate_limits;
    const safeLimits = {};

    for (const name of ['five_hour', 'seven_day']) {
      const limit = rateLimits && rateLimits[name];
      if (!limit || !Number.isFinite(Number(limit.used_percentage))) continue;
      safeLimits[name] = {
        used_percentage: Number(limit.used_percentage),
        resets_at: limit.resets_at ?? null
      };
    }

    if (Object.keys(safeLimits).length > 0) {
      const claudeDirectory = path.join(os.homedir(), '.claude');
      const cachePath = path.join(claudeDirectory, 'jag-insights-usage.json');
      const temporaryPath = `${cachePath}.tmp-${process.pid}`;
      await fs.promises.mkdir(claudeDirectory, { recursive: true });
      await fs.promises.writeFile(temporaryPath, `${JSON.stringify({
        source: 'claude-statusline',
        timestamp: new Date().toISOString(),
        version: data.version || null,
        rate_limits: safeLimits
      }, null, 2)}\n`, 'utf8');
      await fs.promises.rename(temporaryPath, cachePath);
    }

    const labels = [];
    if (safeLimits.five_hour) labels.push(`5h ${safeLimits.five_hour.used_percentage.toFixed(0)}%`);
    if (safeLimits.seven_day) labels.push(`7d ${safeLimits.seven_day.used_percentage.toFixed(0)}%`);
    process.stdout.write(labels.length ? `Claude Code | ${labels.join(' | ')}` : 'Claude Code');
  } catch {
    process.stdout.write('Claude Code');
  }
});
