const DEFAULT_STATUS_BAR_FORMAT = '$(hubot) AG(Gemini {ag}, Codex {agcx}, Claude {agcc}) | Codex:{cx} | Claude Code:{cc}';

function categorizeModels(models) {
  const gemini = [];
  const codex = [];
  const claude = [];
  const others = [];

  for (const model of models || []) {
    const label = (model.label || '').toLowerCase();
    const modelId = (model.modelId || '').toLowerCase();

    if (label.includes('gemini')) {
      gemini.push(model);
    } else if (label.includes('gpt') || modelId.includes('gpt') || modelId.includes('openai')) {
      codex.push(model);
    } else if (label.includes('claude')) {
      claude.push(model);
    } else {
      others.push(model);
    }
  }

  return { gemini, codex, claude, others };
}

/**
 * Quotas are compared internally as consumption, so a single convention drives
 * summarizing, coloring and thresholds. Providers that only report a remaining
 * share are converted here rather than at each call site.
 *
 * Display direction is per provider, so each segment matches the number its own
 * tool shows: Antigravity reports remaining quota in its own UI, while Claude
 * Code's `/usage` panel and the Codex rate-limit output report consumption. The
 * tooltip states the direction so the two never read as the same measure.
 */
function usedPercentageOf(model) {
  if (!model) return null;
  const used = Number(model.usedPercentage);
  if (Number.isFinite(used)) return used;
  const remaining = Number(model.remainingPercentage);
  return Number.isFinite(remaining) ? 100 - remaining : null;
}

function remainingPercentageOf(model) {
  const used = usedPercentageOf(model);
  return used === null ? null : 100 - used;
}

/**
 * A provider is summarized by its most consumed window, which is the one that
 * will exhaust first. This holds whichever direction the value is displayed in,
 * since the most consumed window is also the one with the least left.
 */
function maximumUsed(models) {
  let maximum = null;

  for (const model of models || []) {
    if (model.isNA || model.isOutdated) continue;
    const used = usedPercentageOf(model);
    if (used === null) continue;
    maximum = maximum === null ? used : Math.max(maximum, used);
  }

  return maximum;
}

function summarizeQuotas(models, codexQuota, claudeCodeQuota, geminiActivity) {
  const { gemini, codex, claude, others } = categorizeModels(models);
  const currentUsed = quota => quota && quota.health && quota.health.status !== 'fresh'
    ? null : maximumUsed(quota && quota.models);

  return {
    antigravity: maximumUsed([...gemini, ...others]),
    antigravityCodex: maximumUsed(codex),
    antigravityClaude: maximumUsed(claude),
    codex: currentUsed(codexQuota),
    claudeCode: currentUsed(claudeCodeQuota),
    claudeCodeActivity: claudeCodeQuota && claudeCodeQuota.activity,
    geminiActivity: geminiActivity || null
  };
}

function formatPercentage(value) {
  return value === null ? 'N/A' : `${value.toFixed(0)}%`;
}

// Antigravity's own UI counts down, so its placeholders render remaining quota.
function formatRemaining(usedValue) {
  return usedValue === null ? 'N/A' : `${(100 - usedValue).toFixed(0)}%`;
}

function formatClaudeCodeValue(claudeCode, activity) {
  if (claudeCode !== null) {
    return `${claudeCode.toFixed(0)}%`;
  }
  const activityTokens = activity && activity.last7Days && activity.last7Days.totalTokens;
  if (activity && activity.available !== false && activityTokens !== null
      && activityTokens !== undefined && Number.isFinite(Number(activityTokens))) {
    const tokens = Number(activityTokens);
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M(7d)`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K(7d)`;
    return `${tokens}(7d)`;
  }
  return 'N/A';
}

function formatStatusBarText(template, summary) {
  const values = {
    // Antigravity placeholders: remaining quota, matching the Antigravity UI.
    ag: formatRemaining(summary.antigravity),
    agcx: formatRemaining(summary.antigravityCodex),
    agcl: formatRemaining(summary.antigravityClaude),
    agcc: formatRemaining(summary.antigravityClaude),
    // CLI placeholders: consumption, matching `/usage` and the Codex output.
    cx: formatPercentage(summary.codex),
    cc: formatClaudeCodeValue(summary.claudeCode, summary.claudeCodeActivity),
    // Gemini CLI activity — shows 7d token count if available
    gm: (() => {
      const ga = summary.geminiActivity;
      if (!ga || !ga.last7Days || ga.last7Days.totalTokens === 0) return 'N/A';
      const t = ga.last7Days.totalTokens;
      if (t >= 1000000) return `${(t / 1000000).toFixed(1)}M(7d)`;
      if (t >= 1000) return `${(t / 1000).toFixed(1)}K(7d)`;
      return `${t}(7d)`;
    })(),
    // Backward-compatible alias for the previous local Claude placeholder.
    cl: formatRemaining(summary.antigravityClaude)
  };

  let text = template || DEFAULT_STATUS_BAR_FORMAT;
  for (const [name, value] of Object.entries(values)) {
    text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), value);
  }
  return text;
}

function statusBarProviderForTemplate(segment) {
  const providers = [];
  if (/\{(?:ag|agcx|agcl|agcc|cl)\}/.test(segment)) providers.push('antigravity');
  if (/\{cx\}/.test(segment)) providers.push('codex');
  if (/\{cc\}/.test(segment)) providers.push('claudeCode');
  return providers.length === 1 ? providers[0] : null;
}

/**
 * Split a status bar template into independently colorable provider items.
 * Provider sections are separated with `|`, as in the default format.
 * Ambiguous templates that mix providers in one section fall back to the
 * default provider layout because VS Code cannot color part of one item.
 */
function formatStatusBarSegments(template, summary) {
  const source = template || DEFAULT_STATUS_BAR_FORMAT;
  let sections = source.split('|').map(section => section.trim()).filter(Boolean);

  if (sections.some(section => !statusBarProviderForTemplate(section))) {
    sections = DEFAULT_STATUS_BAR_FORMAT.split('|').map(section => section.trim());
  }

  const result = { antigravity: '', codex: '', claudeCode: '' };
  for (const section of sections) {
    const provider = statusBarProviderForTemplate(section);
    if (!provider) continue;
    const formatted = formatStatusBarText(section, summary);
    result[provider] = result[provider]
      ? `${result[provider]} | ${formatted}`
      : formatted;
  }
  return result;
}

module.exports = {
  DEFAULT_STATUS_BAR_FORMAT,
  categorizeModels,
  usedPercentageOf,
  remainingPercentageOf,
  summarizeQuotas,
  formatStatusBarText,
  formatStatusBarSegments
};
