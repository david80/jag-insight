const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// 1. Read version from package.json
const packageJsonPath = path.join(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;
const name = packageJson.name || 'jag-insight';

// 2. Define output directory: releases/${version}
const outputDir = path.join(__dirname, `../releases/${version}`);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const outputFile = path.join(outputDir, `${name}-${version}.vsix`);

console.log(`Packaging extension version ${version}...`);
console.log(`Target output: ${outputFile}`);

try {
  // 3. Execute the pinned local vsce package for reproducible builds.
  const vscePath = require.resolve('@vscode/vsce/vsce');
  execFileSync(process.execPath, [
    vscePath,
    'package',
    '--no-yarn',
    '--allow-missing-repository',
    '--skip-license',
    '-o',
    outputFile
  ], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log(`\nSuccessfully packaged and saved to: ${outputFile}`);
} catch (error) {
  console.error('Failed to package extension:', error.message);
  process.exit(1);
}
