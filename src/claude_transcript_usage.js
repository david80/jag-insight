const fs = require('fs');
const path = require('path');
const { IncrementalJsonlCache } = require('./incremental_jsonl_cache');
const { defaultClaudeTranscriptRoots } = require('./claude_paths');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 7;
const transcriptCache = new IncrementalJsonlCache('claude-transcripts', 2);

function setClaudeTranscriptCacheDirectory(directory) {
  transcriptCache.setStorageDirectory(directory);
}

function defaultTranscriptRoots() {
  return defaultClaudeTranscriptRoots();
}

async function collectJsonlFiles(directory, files = []) {
  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return files;
    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectJsonlFiles(entryPath, files);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) files.push(entryPath);
  }
  return files;
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeTurn(record, filePath, lineNumber) {
  if (!record || record.type !== 'assistant' || !record.message || !record.message.usage) return null;
  const usage = record.message.usage;
  const cacheCreation = usage.cache_creation || {};
  const turn = {
    id: record.message.id || `${filePath}:${lineNumber}`,
    requestId: record.requestId || record.request_id || null,
    sessionId: record.sessionId || null,
    timestamp: record.timestamp || null,
    model: record.message.model || 'unknown',
    inputTokens: numeric(usage.input_tokens),
    outputTokens: numeric(usage.output_tokens),
    cacheReadTokens: numeric(usage.cache_read_input_tokens),
    cacheCreationTokens: numeric(usage.cache_creation_input_tokens),
    cacheCreation5mTokens: numeric(cacheCreation.ephemeral_5m_input_tokens),
    cacheCreation1hTokens: numeric(cacheCreation.ephemeral_1h_input_tokens)
  };
  turn.totalTokens = turn.inputTokens + turn.outputTokens + turn.cacheReadTokens + turn.cacheCreationTokens;

  if (turn.outputTokens === 0 && turn.inputTokens > 0) return null;
  return turn.totalTokens > 0 ? turn : null;
}

function parseTranscriptLine(line, filePath, lineNumber) {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes('"usage"')) return null;
  try {
    const turn = safeTurn(JSON.parse(trimmed), filePath, lineNumber);
    if (!turn) return null;
    return { key: `${turn.requestId || ''}:${turn.id}`, value: turn };
  } catch {
    return null;
  }
}

async function parseTranscript(filePath) {
  try {
    return await transcriptCache.parseFile(
      filePath,
      (line, lineNumber) => parseTranscriptLine(line, filePath, lineNumber)
    );
  } catch {
    return [];
  }
}

function emptyPeriod() {
  return {
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
    cacheCreation5mTokens: 0, cacheCreation1hTokens: 0, totalTokens: 0,
    turns: 0, sessions: 0, models: {}, modelTokens: {}
  };
}

function aggregatePeriod(turns, cutoff) {
  const result = emptyPeriod();
  const sessions = new Set();

  for (const turn of turns) {
    const timestamp = Date.parse(turn.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < cutoff) continue;
    result.inputTokens += turn.inputTokens;
    result.outputTokens += turn.outputTokens;
    result.cacheReadTokens += turn.cacheReadTokens;
    result.cacheCreationTokens += turn.cacheCreationTokens;
    result.cacheCreation5mTokens += turn.cacheCreation5mTokens || 0;
    result.cacheCreation1hTokens += turn.cacheCreation1hTokens || 0;
    result.totalTokens += turn.totalTokens;
    result.turns += 1;
    if (turn.sessionId) sessions.add(turn.sessionId);
    result.models[turn.model] = (result.models[turn.model] || 0) + turn.totalTokens;

    const modelKey = turn.model || 'unknown';
    if (!result.modelTokens[modelKey]) {
      result.modelTokens[modelKey] = {
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
        cacheCreation5mTokens: 0, cacheCreation1hTokens: 0
      };
    }
    const model = result.modelTokens[modelKey];
    model.inputTokens += turn.inputTokens;
    model.outputTokens += turn.outputTokens;
    model.cacheReadTokens += turn.cacheReadTokens;
    model.cacheCreationTokens += turn.cacheCreationTokens;
    model.cacheCreation5mTokens += turn.cacheCreation5mTokens || 0;
    model.cacheCreation1hTokens += turn.cacheCreation1hTokens || 0;
  }

  result.sessions = sessions.size;
  return result;
}

async function readClaudeTranscriptUsage(roots = defaultTranscriptRoots(), now = new Date()) {
  const cutoff = now.getTime() - DEFAULT_LOOKBACK_DAYS * DAY_MS;
  const discovered = [];
  let rootsFound = 0;
  for (const root of roots) {
    try {
      const stats = await fs.promises.stat(root);
      if (!stats.isDirectory()) continue;
      rootsFound += 1;
      await collectJsonlFiles(root, discovered);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') throw error;
    }
  }

  const activeFiles = new Set();
  const allTurns = [];
  let latestTranscriptAt = null;
  for (const filePath of discovered) {
    let stats;
    try { stats = await fs.promises.stat(filePath); } catch { continue; }
    if (!latestTranscriptAt || stats.mtimeMs > Date.parse(latestTranscriptAt)) {
      latestTranscriptAt = stats.mtime.toISOString();
    }
    if (stats.mtimeMs < cutoff) continue;
    activeFiles.add(filePath);
    allTurns.push(...await parseTranscript(filePath));
  }

  transcriptCache.prune(activeFiles);
  await transcriptCache.flush().catch(() => {});
  return {
    source: 'claude-transcripts',
    timestamp: now.toISOString(),
    available: rootsFound > 0,
    rootsFound,
    discoveredFiles: discovered.length,
    scannedFiles: activeFiles.size,
    latestTranscriptAt,
    last24Hours: aggregatePeriod(allTurns, now.getTime() - DAY_MS),
    last7Days: aggregatePeriod(allTurns, cutoff)
  };
}

module.exports = {
  defaultTranscriptRoots,
  readClaudeTranscriptUsage,
  safeTurn,
  parseTranscriptLine,
  setClaudeTranscriptCacheDirectory
};
