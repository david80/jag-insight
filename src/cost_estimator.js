/**
 * cost_estimator.js
 *
 * Estimates approximate token costs based on publicly available pricing.
 * Inspired by ccusage (github.com/ryoppippi/ccusage).
 *
 * NOTE: These are rough estimates only. For actual billing, refer to
 * your Anthropic / OpenAI account dashboard.
 */

// Prices in USD per 1,000,000 tokens
const PRICING = {
  // Anthropic Claude (Claude Code defaults)
  'claude-opus-4':        { input: 15.0,  output: 75.0,  cacheRead: 1.5,   cacheWrite: 18.75 },
  'claude-sonnet-4':      { input: 3.0,   output: 15.0,  cacheRead: 0.3,   cacheWrite: 3.75  },
  'claude-sonnet-3-7':    { input: 3.0,   output: 15.0,  cacheRead: 0.3,   cacheWrite: 3.75  },
  'claude-haiku-3-5':     { input: 0.8,   output: 4.0,   cacheRead: 0.08,  cacheWrite: 1.0   },
  // OpenAI (Codex CLI)
  'o4-mini':              { input: 1.1,   output: 4.4,   cacheRead: 0.275, cacheWrite: 0.0   },
  'o3-mini':              { input: 1.1,   output: 4.4,   cacheRead: 0.275, cacheWrite: 0.0   },
  'gpt-4o':               { input: 2.5,   output: 10.0,  cacheRead: 1.25,  cacheWrite: 0.0   },
  'gpt-4o-mini':          { input: 0.15,  output: 0.6,   cacheRead: 0.075, cacheWrite: 0.0   },
  // Gemini (Gemini CLI)
  'gemini-2-5-pro':       { input: 1.25,  output: 10.0,  cacheRead: 0.315, cacheWrite: 0.0   },
  'gemini-2-5-flash':     { input: 0.075, output: 0.3,   cacheRead: 0.019, cacheWrite: 0.0   },
  // Fallback
  'default':              { input: 3.0,   output: 15.0,  cacheRead: 0.3,   cacheWrite: 0.0   }
};

/**
 * Resolve the pricing tier for a given model ID string.
 * @param {string} modelId - The model identifier (e.g. "claude-sonnet-4-20250514")
 * @returns {{ input: number, output: number, cacheRead: number, cacheWrite: number }}
 */
function resolvePricing(modelId) {
  if (!modelId) return PRICING['default'];
  const id = modelId.toLowerCase();

  for (const [key, price] of Object.entries(PRICING)) {
    if (key === 'default') continue;
    // Normalize key: "claude-sonnet-4" matches "claude-sonnet-4-20250514"
    if (id.includes(key.replace(/-/g, '-'))) return price;
  }
  return PRICING['default'];
}

/**
 * Estimate cost for a set of token counts and a model.
 * @param {{ inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheCreationTokens: number }} tokens
 * @param {string} modelId
 * @returns {number} Estimated cost in USD
 */
function estimateCostForTokens(tokens, modelId) {
  const price = resolvePricing(modelId);
  const M = 1_000_000;
  const cost =
    (tokens.inputTokens       / M) * price.input +
    (tokens.outputTokens      / M) * price.output +
    (tokens.cacheReadTokens   / M) * price.cacheRead +
    (tokens.cacheCreationTokens / M) * price.cacheWrite;
  return cost;
}

/**
 * Estimate total cost from an aggregated period (with per-model breakdown).
 * @param {{ models: Record<string, number> } & { inputTokens?: number, outputTokens?: number }} period
 * @param {number} [defaultInputTokens]
 * @param {number} [defaultOutputTokens]
 * @returns {number} Estimated cost in USD
 */
function estimatePeriodCost(period) {
  if (!period) return 0;

  // If we have per-model token data (from claude_transcript_usage), use it
  if (period.modelTokens) {
    let total = 0;
    for (const [modelId, tokens] of Object.entries(period.modelTokens)) {
      total += estimateCostForTokens(tokens, modelId);
    }
    return total;
  }

  // Fallback: use aggregate totals with default pricing
  return estimateCostForTokens(
    {
      inputTokens: period.inputTokens || 0,
      outputTokens: period.outputTokens || 0,
      cacheReadTokens: period.cacheReadTokens || 0,
      cacheCreationTokens: period.cacheCreationTokens || 0
    },
    null
  );
}

/**
 * Format a cost value to a human-readable string.
 * @param {number} usd
 * @returns {string} e.g. "$1.23" or "< $0.01"
 */
function formatCost(usd) {
  if (!usd || usd < 0.005) return '< $0.01';
  if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}K`;
  if (usd >= 100) return `$${usd.toFixed(0)}`;
  if (usd >= 10) return `$${usd.toFixed(1)}`;
  return `$${usd.toFixed(2)}`;
}

module.exports = {
  PRICING,
  resolvePricing,
  estimateCostForTokens,
  estimatePeriodCost,
  formatCost
};
