const pricingData = require('../resources/model_pricing.json');

const PRICING = Object.fromEntries(pricingData.models.map(model => [model.pattern, {
  input: model.input,
  output: model.output,
  cacheRead: model.cacheRead
}]));

function resolvePricing(modelId) {
  if (!modelId) return null;
  const id = String(modelId).toLowerCase();
  const candidates = pricingData.models.slice().sort((a, b) => b.pattern.length - a.pattern.length);
  return candidates.find(candidate => id.includes(candidate.pattern)) || null;
}

function estimateCostForTokens(tokens, modelId) {
  const price = resolvePricing(modelId);
  if (!price) return null;
  const million = 1_000_000;
  const cacheCreation = Number(tokens.cacheCreationTokens) || 0;
  const cache5m = Number(tokens.cacheCreation5mTokens) || 0;
  const cache1h = Number(tokens.cacheCreation1hTokens) || 0;
  const hasDetailedCache = cache5m > 0 || cache1h > 0;
  const cacheWriteCost = hasDetailedCache
    ? (cache5m / million) * price.input * pricingData.cacheCreationMultipliers.fiveMinute
      + (cache1h / million) * price.input * pricingData.cacheCreationMultipliers.oneHour
    : (cacheCreation / million) * price.input * pricingData.cacheCreationMultipliers.fiveMinute;

  return ((Number(tokens.inputTokens) || 0) / million) * price.input
    + ((Number(tokens.outputTokens) || 0) / million) * price.output
    + ((Number(tokens.cacheReadTokens) || 0) / million) * price.cacheRead
    + cacheWriteCost;
}

function estimatePeriodCostDetailed(period) {
  if (!period || !period.modelTokens) {
    return { cost: null, unpricedModels: ['unknown'], pricedModels: [], coverage: 0 };
  }
  let cost = 0;
  let pricedTokenCount = 0;
  let totalTokenCount = 0;
  const pricedModels = [];
  const unpricedModels = [];

  for (const [modelId, tokens] of Object.entries(period.modelTokens)) {
    const modelTokens = (Number(tokens.inputTokens) || 0)
      + (Number(tokens.outputTokens) || 0)
      + (Number(tokens.cacheReadTokens) || 0)
      + (Number(tokens.cacheCreationTokens) || 0);
    totalTokenCount += modelTokens;
    const modelCost = estimateCostForTokens(tokens, modelId);
    if (modelCost === null) {
      unpricedModels.push(modelId);
    } else {
      pricedModels.push(modelId);
      pricedTokenCount += modelTokens;
      cost += modelCost;
    }
  }

  return {
    cost: unpricedModels.length > 0 ? null : cost,
    knownCost: cost,
    pricedModels,
    unpricedModels,
    coverage: totalTokenCount > 0 ? pricedTokenCount / totalTokenCount : 1,
    pricingVersion: pricingData.version
  };
}

function estimatePeriodCost(period) {
  return estimatePeriodCostDetailed(period).cost;
}

function formatCost(usd) {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return 'Unpriced';
  if (usd < 0.005) return '< $0.01';
  if (usd >= 1000) return `$${(usd / 1000).toFixed(1)}K`;
  if (usd >= 100) return `$${usd.toFixed(0)}`;
  if (usd >= 10) return `$${usd.toFixed(1)}`;
  return `$${usd.toFixed(2)}`;
}

module.exports = {
  PRICING,
  PRICING_VERSION: pricingData.version,
  resolvePricing,
  estimateCostForTokens,
  estimatePeriodCost,
  estimatePeriodCostDetailed,
  formatCost
};
