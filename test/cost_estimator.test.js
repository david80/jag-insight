const assert = require('node:assert/strict');
const test = require('node:test');

const {
  estimateCostForTokens,
  estimatePeriodCost,
  formatCost
} = require('../src/cost_estimator');

test('prices one-hour Claude cache writes separately from five-minute writes', () => {
  const cost = estimateCostForTokens({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 2_000_000,
    cacheCreation5mTokens: 1_000_000,
    cacheCreation1hTokens: 1_000_000
  }, 'claude-sonnet-4-6');

  assert.equal(cost, 9.75);
});

test('does not invent a default price for unknown models', () => {
  const period = {
    modelTokens: {
      'future-model': { inputTokens: 1000, outputTokens: 1000 }
    }
  };
  assert.equal(estimatePeriodCost(period), null);
  assert.equal(formatCost(estimatePeriodCost(period)), 'Unpriced');
});
