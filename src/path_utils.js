const os = require('os');
const path = require('path');

function resolveUserPath(filePath) {
  if (!filePath) return null;
  if (filePath === '~') return os.homedir();
  if (/^~[\\/]/.test(filePath)) {
    const segments = filePath.slice(2).split(/[\\/]+/).filter(Boolean);
    return path.join(os.homedir(), ...segments);
  }
  return path.resolve(filePath);
}

module.exports = { resolveUserPath };
