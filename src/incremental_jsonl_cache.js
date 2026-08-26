const fs = require('fs');
const path = require('path');

const CACHE_FORMAT_VERSION = 1;

async function writeJsonAtomic(filePath, value) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(temporaryPath, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.promises.rename(temporaryPath, filePath);
}

function readLines(filePath, start, prefix, onLine, initialLineNumber) {
  return new Promise((resolve, reject) => {
    let pending = prefix || '';
    let lineNumber = initialLineNumber || 0;
    const stream = fs.createReadStream(filePath, { encoding: 'utf8', start });

    stream.on('data', chunk => {
      pending += chunk;
      let newlineIndex;
      while ((newlineIndex = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newlineIndex).replace(/\r$/, '');
        pending = pending.slice(newlineIndex + 1);
        lineNumber += 1;
        onLine(line, lineNumber);
      }
    });
    stream.on('error', reject);
    stream.on('end', () => resolve({ trailing: pending, lineNumber }));
  });
}

class IncrementalJsonlCache {
  constructor(name, parserVersion = 1) {
    this.name = name;
    this.parserVersion = parserVersion;
    this.entries = new Map();
    this.cachePath = null;
    this.loaded = false;
    this.dirty = false;
  }

  setStorageDirectory(directory) {
    this.cachePath = directory ? path.join(directory, `${this.name}-parse-cache.json`) : null;
    this.loaded = false;
    this.entries.clear();
  }

  async load() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.cachePath) return;
    try {
      const raw = JSON.parse(await fs.promises.readFile(this.cachePath, 'utf8'));
      if (raw.formatVersion !== CACHE_FORMAT_VERSION || raw.parserVersion !== this.parserVersion) return;
      for (const [filePath, entry] of Object.entries(raw.entries || {})) {
        if (!entry || !Array.isArray(entry.records)) continue;
        this.entries.set(filePath, entry);
      }
    } catch {
      // A missing, partial, or incompatible derived cache is safe to rebuild.
    }
  }

  async parseFile(filePath, parseLine) {
    await this.load();
    const stats = await fs.promises.stat(filePath);
    const previous = this.entries.get(filePath);

    if (previous && previous.size === stats.size && previous.mtimeMs === stats.mtimeMs) {
      return previous.records.map(item => item.value);
    }

    const canAppend = previous && stats.size > previous.size;
    const records = new Map(
      canAppend ? previous.records.map(item => [item.key, item.value]) : []
    );
    const start = canAppend ? previous.size : 0;
    const prefix = canAppend ? previous.trailing || '' : '';
    const initialLineNumber = canAppend ? previous.lineNumber || 0 : 0;

    const result = await readLines(filePath, start, prefix, (line, lineNumber) => {
      const parsed = parseLine(line, lineNumber);
      if (!parsed || parsed.key === undefined || parsed.value === undefined) return;
      records.set(String(parsed.key), parsed.value);
    }, initialLineNumber);

    this.entries.set(filePath, {
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      trailing: result.trailing,
      lineNumber: result.lineNumber,
      records: [...records.entries()].map(([key, value]) => ({ key, value }))
    });
    this.dirty = true;
    return [...records.values()];
  }

  prune(activePaths) {
    const keep = activePaths instanceof Set ? activePaths : new Set(activePaths || []);
    for (const filePath of this.entries.keys()) {
      if (!keep.has(filePath)) {
        this.entries.delete(filePath);
        this.dirty = true;
      }
    }
  }

  async flush() {
    if (!this.dirty || !this.cachePath) return;
    const entries = Object.fromEntries(
      [...this.entries].map(([filePath, entry]) => {
        // Keep partial lines only in memory. They can contain prompt text, so the
        // persisted cache rewinds to the last complete line instead.
        const trailingBytes = Buffer.byteLength(entry.trailing || '', 'utf8');
        return [filePath, {
          ...entry,
          size: Math.max(0, entry.size - trailingBytes),
          trailing: ''
        }];
      })
    );
    await writeJsonAtomic(this.cachePath, {
      formatVersion: CACHE_FORMAT_VERSION,
      parserVersion: this.parserVersion,
      entries
    });
    this.dirty = false;
  }
}

module.exports = {
  IncrementalJsonlCache,
  readLines,
  writeJsonAtomic
};
