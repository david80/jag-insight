const fs = require('fs');
const os = require('os');
const path = require('path');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 7;
const fileCache = new Map();

function defaultTranscriptRoots() {
  return [
    path.join(os.homedir(), '.claude', 'projects'),
    path.join(os.homedir(), 'Library', 'Developer', 'Xcode', 'CodingAssistant', 'ClaudeAgentConfig', 'projects')
  ];
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
    if (entry.isDirectory()) {
      await collectJsonlFiles(entryPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(entryPath);
    }
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
  const turn = {
    id: record.message.id || `${filePath}:${lineNumber}`,
    sessionId: record.sessionId || null,
    timestamp: record.timestamp || null,
    model: record.message.model || 'unknown',
    inputTokens: numeric(usage.input_tokens),
    outputTokens: numeric(usage.output_tokens),
    cacheReadTokens: numeric(usage.cache_read_input_tokens),
    cacheCreationTokens: numeric(usage.cache_creation_input_tokens)
  };
  turn.totalTokens = turn.inputTokens + turn.outputTokens + turn.cacheReadTokens + turn.cacheCreationTokens;

  // Filter out streaming placeholder records: Claude Code writes incremental JSONL
  // entries during streaming with outputTokens=0 that are never back-filled.
  // A record with no output tokens but present input is an incomplete snapshot.
  if (turn.outputTokens === 0 && turn.inputTokens > 0) return null;

  return turn.totalTokens > 0 ? turn : null;
}

async function parseTranscript(filePath) {
  let content;
  try {
    content = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return [];
  }

  const turnsByMessage = new Map();
  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || !line.includes('"usage"')) continue;
    try {
      const turn = safeTurn(JSON.parse(line), filePath, index + 1);
      if (turn) turnsByMessage.set(turn.id, turn);
    } catch {
      // Claude can leave an incomplete final JSONL line while writing.
    }
  }
  return [...turnsByMessage.values()];
}

function emptyPeriod() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalTokens: 0,
    turns: 0,
    sessions: 0,
    models: {},
    // Per-model token breakdown for cost estimation (cost_estimator.js)
    modelTokens: {}
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
    result.totalTokens += turn.totalTokens;
    result.turns += 1;
    if (turn.sessionId) sessions.add(turn.sessionId);
    result.models[turn.model] = (result.models[turn.model] || 0) + turn.totalTokens;

    // Accumulate per-model breakdown for cost estimation
    const modelKey = turn.model || 'unknown';
    if (!result.modelTokens[modelKey]) {
      result.modelTokens[modelKey] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0
      };
    }
    result.modelTokens[modelKey].inputTokens        += turn.inputTokens;
    result.modelTokens[modelKey].outputTokens       += turn.outputTokens;
    result.modelTokens[modelKey].cacheReadTokens    += turn.cacheReadTokens;
    result.modelTokens[modelKey].cacheCreationTokens += turn.cacheCreationTokens;
  }

  result.sessions = sessions.size;
  return result;
}

async function readClaudeTranscriptUsage(roots = defaultTranscriptRoots(), now = new Date()) {
  const cutoff = now.getTime() - DEFAULT_LOOKBACK_DAYS * DAY_MS;
  const discovered = [];
  for (const root of roots) {
    await collectJsonlFiles(root, discovered);
  }

  const activeFiles = new Set();
  const allTurns = [];
  for (const filePath of discovered) {
    let stats;
    try {
      stats = await fs.promises.stat(filePath);
    } catch {
      continue;
    }
    if (stats.mtimeMs < cutoff) continue;
    activeFiles.add(filePath);

    let cached = fileCache.get(filePath);
    if (!cached || cached.mtimeMs !== stats.mtimeMs || cached.size !== stats.size) {
      cached = {
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        turns: await parseTranscript(filePath)
      };
      fileCache.set(filePath, cached);
    }
    allTurns.push(...cached.turns);
  }

  for (const cachedPath of fileCache.keys()) {
    if (!activeFiles.has(cachedPath)) fileCache.delete(cachedPath);
  }

  return {
    source: 'claude-transcripts',
    scannedFiles: activeFiles.size,
    last24Hours: aggregatePeriod(allTurns, now.getTime() - DAY_MS),
    last7Days: aggregatePeriod(allTurns, cutoff)
  };
}

module.exports = {
  defaultTranscriptRoots,
  readClaudeTranscriptUsage,
  safeTurn
};
