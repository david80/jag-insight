const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { IncrementalJsonlCache } = require('../src/incremental_jsonl_cache');

test('incrementally parses appended JSONL and preserves an incomplete final line', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jag-incremental-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'records.jsonl');
  fs.writeFileSync(file, '{"id":1,"value":10}\n');
  const cache = new IncrementalJsonlCache('fixture', 1);
  cache.setStorageDirectory(root);
  const parser = line => {
    try {
      const value = JSON.parse(line);
      return { key: value.id, value };
    } catch { return null; }
  };

  assert.equal((await cache.parseFile(file, parser)).length, 1);
  fs.appendFileSync(file, '{"id":2,"private":"PRIVATE_PARTIAL"');
  assert.equal((await cache.parseFile(file, parser)).length, 1);
  await cache.flush();
  const persisted = fs.readFileSync(path.join(root, 'fixture-parse-cache.json'), 'utf8');
  assert.equal(persisted.includes('PRIVATE_PARTIAL'), false);

  const reloaded = new IncrementalJsonlCache('fixture', 1);
  reloaded.setStorageDirectory(root);
  fs.appendFileSync(file, ',"value":20}\n');
  const records = await reloaded.parseFile(file, parser);
  assert.deepEqual(records.map(record => record.value), [10, 20]);
  await reloaded.flush();
  assert.equal(fs.existsSync(path.join(root, 'fixture-parse-cache.json')), true);
});
