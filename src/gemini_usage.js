const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveUserPath } = require('./path_utils');
const { IncrementalJsonlCache } = require('./incremental_jsonl_cache');

const LOOKBACK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const sessionCache = new IncrementalJsonlCache('gemini-sessions', 2);
const telemetryCache = new IncrementalJsonlCache('gemini-telemetry', 1);
const jsonCache = new Map();

function setGeminiCacheDirectory(directory) {
  sessionCache.setStorageDirectory(directory);
  telemetryCache.setStorageDirectory(directory);
  jsonCache.clear();
}

function resolveGeminiPath(customPath) {
  return customPath ? resolveUserPath(customPath) : path.join(os.homedir(), '.gemini', 'tmp');
}

function defaultSessionRoots(customPath) {
  if (customPath) return [resolveGeminiPath(customPath)];
  return [
    path.join(os.homedir(), '.gemini', 'tmp'),
    path.join(os.homedir(), '.gemini', 'sessions')
  ];
}

async function collectSessionFiles(directory, files = []) {
  let entries;
  try {
    entries = await fs.promises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return files;
    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectSessionFiles(entryPath, files);
    else if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.jsonl'))) {
      try {
        const stats = await fs.promises.stat(entryPath);
        files.push({ filePath: entryPath, mtimeMs: stats.mtimeMs, size: stats.size });
      } catch {
        // A session can be rotated while discovery runs.
      }
    }
  }
  return files;
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstValue(object, keys) {
  for (const key of keys) {
    if (object && object[key] !== undefined && object[key] !== null) return object[key];
  }
  return null;
}

function usageTurn(usage, context, fallbackId) {
  if (!usage || typeof usage !== 'object') return null;
  const inputTokens = numeric(firstValue(usage, ['promptTokenCount', 'inputTokenCount', 'input_tokens']));
  const outputTokens = numeric(firstValue(usage, ['candidatesTokenCount', 'outputTokenCount', 'output_tokens']));
  const cacheReadTokens = numeric(firstValue(usage, ['cachedContentTokenCount', 'cacheReadTokenCount']));
  const thoughtTokens = numeric(firstValue(usage, ['thoughtsTokenCount', 'thoughtTokenCount']));
  const toolTokens = numeric(firstValue(usage, ['toolUsePromptTokenCount', 'toolTokenCount']));
  const totalTokens = numeric(firstValue(usage, ['totalTokenCount', 'total_tokens']))
    || inputTokens + outputTokens + cacheReadTokens + thoughtTokens + toolTokens;
  if (totalTokens === 0) return null;

  return {
    id: context.id || fallbackId,
    sessionId: context.sessionId || null,
    timestamp: context.timestamp || null,
    model: context.model || 'gemini',
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens: 0,
    thoughtTokens,
    toolTokens,
    totalTokens
  };
}

function extractTurnsFromObject(root, fallbackPrefix = 'gemini') {
  if (!root || typeof root !== 'object') return [];
  const turns = new Map();
  const rootContext = {
    sessionId: firstValue(root, ['sessionId', 'session_id', 'id']),
    timestamp: firstValue(root, ['timestamp', 'createTime', 'startTime', 'lastUpdated']),
    model: firstValue(root, ['model', 'modelVersion', 'modelName'])
  };

  function visit(value, pathParts, inherited) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...pathParts, index], inherited));
      return;
    }

    const context = {
      sessionId: firstValue(value, ['sessionId', 'session_id']) || inherited.sessionId,
      timestamp: firstValue(value, ['timestamp', 'createTime', 'startTime']) || inherited.timestamp,
      model: firstValue(value, ['model', 'modelVersion', 'modelName']) || inherited.model,
      id: firstValue(value, ['id', 'messageId', 'requestId'])
    };
    const usage = value.usageMetadata || value.usage_metadata;
    if (usage) {
      const fallbackId = `${fallbackPrefix}:${pathParts.join('.')}`;
      const turn = usageTurn(usage, context, fallbackId);
      if (turn) turns.set(String(turn.id), turn);
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === 'usageMetadata' || key === 'usage_metadata') continue;
      if (child && typeof child === 'object') visit(child, [...pathParts, key], context);
    }
  }

  visit(root, [], rootContext);
  return [...turns.values()];
}

async function parseJsonSession(filePath, stats) {
  const cached = jsonCache.get(filePath);
  if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) return cached.turns;
  try {
    const data = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
    const turns = extractTurnsFromObject(data, filePath);
    jsonCache.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, turns });
    return turns;
  } catch {
    return [];
  }
}

function parseJsonlLine(line, filePath, lineNumber) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const turns = extractTurnsFromObject(JSON.parse(trimmed), `${filePath}:${lineNumber}`);
    if (turns.length === 0) return null;
    const key = turns.map(turn => turn.id).join('|') || lineNumber;
    return { key, value: turns };
  } catch {
    return null;
  }
}

function emptyPeriod() {
  return {
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
    thoughtTokens: 0, toolTokens: 0, totalTokens: 0, turns: 0, sessions: 0,
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
    result.cacheReadTokens += turn.cacheReadTokens || 0;
    result.thoughtTokens += turn.thoughtTokens || 0;
    result.toolTokens += turn.toolTokens || 0;
    result.totalTokens += turn.totalTokens;
    result.turns += 1;
    if (turn.sessionId) sessions.add(turn.sessionId);
    const model = turn.model || 'gemini';
    if (!result.modelTokens[model]) {
      result.modelTokens[model] = {
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0
      };
    }
    result.modelTokens[model].inputTokens += turn.inputTokens;
    result.modelTokens[model].outputTokens += turn.outputTokens + (turn.thoughtTokens || 0);
    result.modelTokens[model].cacheReadTokens += turn.cacheReadTokens || 0;
  }
  result.sessions = sessions.size;
  return result;
}

function telemetryTurn(record, filePath, lineNumber) {
  if (!record || typeof record !== 'object') return null;
  const attributes = record.attributes || (record.body && record.body.attributes) || record;
  const eventName = String(firstValue(record, ['eventName', 'name']) || record.body || '');
  if (!eventName.includes('gemini_cli') && !Object.keys(attributes).some(key => key.includes('gen_ai.usage'))) {
    return null;
  }
  const usage = {
    inputTokenCount: firstValue(attributes, ['gen_ai.usage.input_tokens', 'input_token_count', 'inputTokenCount']),
    outputTokenCount: firstValue(attributes, ['gen_ai.usage.output_tokens', 'output_token_count', 'outputTokenCount']),
    cachedContentTokenCount: firstValue(attributes, ['cached_content_token_count', 'cachedContentTokenCount']),
    thoughtsTokenCount: firstValue(attributes, ['thoughts_token_count', 'thoughtsTokenCount']),
    toolTokenCount: firstValue(attributes, ['tool_token_count', 'toolTokenCount']),
    totalTokenCount: firstValue(attributes, ['total_token_count', 'totalTokenCount'])
  };
  return usageTurn(usage, {
    id: firstValue(attributes, ['request.id', 'request_id', 'prompt_id']) || `${filePath}:${lineNumber}`,
    sessionId: firstValue(attributes, ['session.id', 'session_id']),
    timestamp: firstValue(record, ['timestamp', 'timeUnixNano', 'observedTime'])
      || firstValue(attributes, ['timestamp']),
    model: firstValue(attributes, ['gen_ai.response.model', 'model']) || 'gemini'
  }, `${filePath}:${lineNumber}`);
}

function normalizeTelemetryTimestamp(turn) {
  if (!turn || !turn.timestamp) return turn;
  const raw = String(turn.timestamp);
  if (/^\d{16,}$/.test(raw)) {
    const millis = Number(BigInt(raw) / 1000000n);
    return { ...turn, timestamp: new Date(millis).toISOString() };
  }
  return turn;
}

async function readTelemetry(customPath, now) {
  const candidate = customPath ? resolveUserPath(customPath) : path.join(os.homedir(), '.gemini', 'telemetry.log');
  try {
    const values = await telemetryCache.parseFile(candidate, (line, lineNumber) => {
      try {
        const turn = normalizeTelemetryTimestamp(telemetryTurn(JSON.parse(line), candidate, lineNumber));
        return turn ? { key: turn.id, value: turn } : null;
      } catch {
        return null;
      }
    });
    return buildUsage('gemini-telemetry', values, 1, now);
  } catch {
    return null;
  }
}

function buildUsage(source, turns, scannedFiles, now) {
  const cutoff7d = now.getTime() - LOOKBACK_DAYS * DAY_MS;
  const last7Days = aggregatePeriod(turns, cutoff7d);
  if (last7Days.totalTokens === 0) return null;
  return {
    source,
    timestamp: now.toISOString(),
    scannedFiles,
    last24Hours: aggregatePeriod(turns, now.getTime() - DAY_MS),
    last7Days
  };
}

async function readGeminiUsage(customPath = '', telemetryPath = '', now = new Date()) {
  try {
    const telemetry = await readTelemetry(telemetryPath, now);
    if (telemetry) {
      await telemetryCache.flush().catch(() => {});
      return telemetry;
    }

    const files = [];
    for (const root of defaultSessionRoots(customPath)) await collectSessionFiles(root, files);
    const cutoff = now.getTime() - LOOKBACK_DAYS * DAY_MS;
    const activeFiles = files.filter(file => file.mtimeMs >= cutoff);
    const activePaths = new Set(activeFiles.filter(file => file.filePath.endsWith('.jsonl')).map(file => file.filePath));
    const turns = [];
    for (const file of activeFiles) {
      if (file.filePath.endsWith('.jsonl')) {
        const groups = await sessionCache.parseFile(
          file.filePath,
          (line, lineNumber) => parseJsonlLine(line, file.filePath, lineNumber)
        ).catch(() => []);
        for (const group of groups) turns.push(...group);
      } else {
        turns.push(...await parseJsonSession(file.filePath, file));
      }
    }
    sessionCache.prune(activePaths);
    for (const cachedPath of jsonCache.keys()) {
      if (!activeFiles.some(file => file.filePath === cachedPath)) jsonCache.delete(cachedPath);
    }
    await sessionCache.flush().catch(() => {});
    return buildUsage('gemini-sessions', turns, activeFiles.length, now);
  } catch {
    return null;
  }
}

module.exports = {
  readGeminiUsage,
  resolveGeminiPath,
  defaultSessionRoots,
  extractTurnsFromObject,
  telemetryTurn,
  setGeminiCacheDirectory
};
