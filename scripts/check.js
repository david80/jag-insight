const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function javascriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...javascriptFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(entryPath);
  }
  return files;
}

const roots = ['src', 'scripts', 'resources', 'test'].map(root => path.resolve(__dirname, '..', root));
for (const file of roots.flatMap(javascriptFiles)) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
