/**
 * gemini_usage.js
 *
 * Parses local Gemini CLI session JSONL files to extract token usage.
 * Inspired by ccusage (github.com/ryoppippi/ccusage) which supports
 * Gemini CLI alongside Claude Code and Codex.
 *
 * Gemini CLI stores session data in: ~/.gemini/sessions/
 * Each session is a .jsonl file where each line is a JSON object.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveUserPath } = require('./path_utils');

const LOOKBACK_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function resolveGeminiPath(customPath) {
  if (!customPath) {
    return path.join(os.homedir(), '.gemini', 'sessions');
  }
  return resolveUserPath(customPath);
}

/**
 * Collect all .jsonl session files under the given directory (non-recursive, flat).
 */
async function collectSessionFiles(directory) {
  try {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const filePath = path.join(directory, entry.name);
      try {
        const stats = await fs.promises.stat(filePath);
        files.push({ filePath, mtimeMs: stats.mtimeMs });
      } catch {
        // file may have been rotated away
      }
    }
    return files;
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Parse a single Gemini JSONL file and extract assistant turns with usage data.
 * Gemini CLI uses a similar format to Claude:
 *   { role: "model", parts: [...], usageMetadata: { promptTokenCount, candidatesTokenCount, totalTokenCount } }
 */
async function parseGeminiTranscript(filePath) {
  let content;
  try {
    content = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    return [];
  }

  const turns = [];
  const lines = content.split('\n');

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      const record = JSON.parse(line);

      // Gemini CLI format: top-level role=model with usageMetadata
      const usageMeta = record.usageMetadata || (record.message && record.message.usageMetadata);
      if (!usageMeta) continue;

      const inputTokens  = numeric(usageMeta.promptTokenCount);
      const outputTokens = numeric(usageMeta.candidatesTokenCount || usageMeta.outputTokenCount);
      const totalTokens  = numeric(usageMeta.totalTokenCount) || inputTokens + outputTokens;

      if (totalTokens === 0) continue;

      turns.push({
        id: record.id || `${filePath}:${index}`,
        timestamp: record.timestamp || record.createTime || null,
        model: record.model || record.modelVersion || 'gemini',
        inputTokens,
        outputTokens,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens
      });
    } catch {
      // skip malformed lines
    }
  }

  return turns;
}

function emptyPeriod() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    turns: 0,
    sessions: 0,
    modelTokens: {}
  };
}

function aggregatePeriod(turns, cutoff) {
  const result = emptyPeriod();
  const sessions = new Set();

  for (const turn of turns) {
    const ts = Date.parse(turn.timestamp);
    if (!Number.isFinite(ts) || ts < cutoff) continue;

    result.inputTokens  += turn.inputTokens;
    result.outputTokens += turn.outputTokens;
    result.totalTokens  += turn.totalTokens;
    result.turns += 1;

    if (turn.sessionId) sessions.add(turn.sessionId);

    const modelKey = turn.model || 'gemini';
    if (!result.modelTokens[modelKey]) {
      result.modelTokens[modelKey] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
    }
    result.modelTokens[modelKey].inputTokens  += turn.inputTokens;
    result.modelTokens[modelKey].outputTokens += turn.outputTokens;
  }

  result.sessions = sessions.size;
  return result;
}

/**
 * Read and aggregate Gemini CLI usage from local session files.
 * Returns null if no sessions found, otherwise returns:
 * {
 *   source: 'gemini-sessions',
 *   scannedFiles: number,
 *   last24Hours: { inputTokens, outputTokens, totalTokens, turns, sessions, modelTokens },
 *   last7Days:   { ... }
 * }
 */
async function readGeminiUsage(customPath) {
  try {
    const sessionPath = resolveGeminiPath(customPath);
    const now = new Date();
    const cutoff7d  = now.getTime() - LOOKBACK_DAYS * DAY_MS;
    const cutoff24h = now.getTime() - DAY_MS;

    const files = await collectSessionFiles(sessionPath);
    const activeFiles = files.filter(f => f.mtimeMs >= cutoff7d);

    if (activeFiles.length === 0) return null;

    const allTurns = [];
    for (const { filePath } of activeFiles) {
      const turns = await parseGeminiTranscript(filePath);
      allTurns.push(...turns);
    }

    if (allTurns.length === 0) return null;

    return {
      source: 'gemini-sessions',
      scannedFiles: activeFiles.length,
      last24Hours: aggregatePeriod(allTurns, cutoff24h),
      last7Days:   aggregatePeriod(allTurns, cutoff7d)
    };
  } catch {
    return null;
  }
}

module.exports = {
  readGeminiUsage,
  resolveGeminiPath
};
