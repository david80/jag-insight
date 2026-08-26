function ageMs(timestamp, now = new Date()) {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? Math.max(0, now.getTime() - parsed) : null;
}

function health(provider, status, fetchedAt, error = null, source = null) {
  return {
    provider,
    status,
    fetchedAt: fetchedAt || null,
    source: source || null,
    error: error ? String(error.message || error) : null
  };
}

function fresh(provider, data, now = new Date(), staleAfterMs = 120000) {
  if (!data) return null;
  const fetchedAt = data.timestamp || now.toISOString();
  const stale = ageMs(fetchedAt, now);
  const status = stale !== null && stale > staleAfterMs ? 'stale' : 'fresh';
  return {
    ...data,
    health: health(provider, status, fetchedAt, null, data.source)
  };
}

function unavailable(provider, error = null, now = new Date()) {
  return {
    source: null,
    models: [],
    health: health(provider, error ? 'error' : 'unavailable', now.toISOString(), error)
  };
}

function stale(provider, previous, error = null) {
  if (!previous) return unavailable(provider, error);
  const fetchedAt = previous.health && previous.health.fetchedAt
    ? previous.health.fetchedAt
    : previous.timestamp;
  return {
    ...previous,
    health: health(provider, 'stale', fetchedAt, error, previous.source)
  };
}

function formatAge(timestamp, now = new Date()) {
  const age = ageMs(timestamp, now);
  if (age === null) return 'unknown age';
  const minutes = Math.floor(age / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

module.exports = { ageMs, fresh, unavailable, stale, formatAge };
