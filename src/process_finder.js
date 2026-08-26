const { execFile } = require('child_process');
const { promisify } = require('util');
const https = require('https');
const logger = require('./logger');

const execFileAsync = promisify(execFile);

function parsePosixProcessList(stdout) {
  return String(stdout || '')
    .split(/\r?\n/)
    .map(line => line.match(/^\s*(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map(match => ({ pid: Number(match[1]), commandLine: match[2] }))
    .filter(processInfo => processInfo.commandLine.includes('language_server'));
}

function parseWindowsProcessList(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return [];

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  return (Array.isArray(parsed) ? parsed : [parsed])
    .map(item => ({
      pid: Number(item.ProcessId),
      commandLine: typeof item.CommandLine === 'string' ? item.CommandLine : ''
    }))
    .filter(processInfo => Number.isFinite(processInfo.pid) && processInfo.commandLine.includes('language_server'));
}

function parseLsofPorts(stdout) {
  const ports = new Set();
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const match = line.match(/:(\d+)\s+/);
    if (match) {
      const port = Number(match[1]);
      if (Number.isInteger(port) && port > 1024) ports.add(port);
    }
  }
  return [...ports];
}

function parseWindowsNetstatPorts(stdout, pid) {
  const ports = new Set();
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 5 || columns[0].toUpperCase() !== 'TCP') continue;
    if (columns[3].toUpperCase() !== 'LISTENING' || Number(columns[4]) !== Number(pid)) continue;
    const portMatch = columns[1].match(/:(\d+)$/);
    if (!portMatch) continue;
    const port = Number(portMatch[1]);
    if (Number.isInteger(port) && port > 1024) ports.add(port);
  }
  return [...ports];
}

function selectLanguageServerProcess(processes, workspacePath) {
  if (!Array.isArray(processes) || processes.length === 0) return null;

  if (workspacePath) {
    const sanitizedPath = workspacePath.replace(/[/\\:]/g, '_');
    const folderName = workspacePath.split(/[/\\]/).pop();
    const matched = processes.find(processInfo =>
      processInfo.commandLine.includes(sanitizedPath)
      || (folderName && processInfo.commandLine.includes(folderName))
    );
    if (matched) return matched;
  }

  return processes.find(processInfo =>
    /--(?:extension|api)_server_port(?:=|\s+)\d+/.test(processInfo.commandLine)
  ) || null;
}

class ProcessFinder {
  constructor(platform = process.platform) {
    this.platform = platform;
  }

  async listLanguageServerProcesses() {
    if (this.platform === 'win32') {
      const command = [
        "$ErrorActionPreference = 'Stop'",
        "$items = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'language_server' } | Select-Object ProcessId, CommandLine)",
        'ConvertTo-Json -InputObject $items -Compress'
      ].join('; ');
      const { stdout } = await execFileAsync('powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        command
      ], { maxBuffer: 1024 * 1024, windowsHide: true });
      return parseWindowsProcessList(stdout);
    }

    const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,command='], { maxBuffer: 1024 * 1024 });
    return parsePosixProcessList(stdout);
  }

  async detectProcessInfo(workspacePath) {
    logger.info('ProcessFinder', 'Starting process detection...', { workspacePath, platform: this.platform });

    try {
      const processes = await this.listLanguageServerProcesses();
      const target = selectLanguageServerProcess(processes, workspacePath);

      if (!target) {
        logger.error('ProcessFinder', 'No language server process found with valid ports');
        return null;
      }

      const portMatch = target.commandLine.match(/--(?:extension|api)_server_port(?:=|\s+)(\d+)/);
      if (!portMatch) {
        logger.error('ProcessFinder', 'Could not find API/extension server port in process arguments');
        return null;
      }

      const extensionPort = Number(portMatch[1]);
      logger.info('ProcessFinder', `Found PID: ${target.pid}, Extension Port: ${extensionPort}`);

      let discoveredPorts = [];
      try {
        discoveredPorts = await this.findListeningPorts(target.pid);
        logger.info('ProcessFinder', `Discovered listening ports for PID ${target.pid}: ${discoveredPorts.join(', ')}`);
      } catch (error) {
        logger.debug('ProcessFinder', `Port discovery failed: ${error.message}`);
      }

      const connectPort = await this.findConnectPort(extensionPort, discoveredPorts);
      if (!connectPort) {
        logger.error('ProcessFinder', 'Could not find a working connect port');
        return null;
      }

      const csrfToken = this.extractCsrfToken(target.commandLine);
      return { extensionPort, connectPort, csrfToken };
    } catch (error) {
      logger.error('ProcessFinder', `Failed to detect process: ${error.message}`);
      return null;
    }
  }

  async findListeningPorts(pid) {
    if (this.platform === 'win32') {
      const { stdout } = await execFileAsync('netstat.exe', ['-ano', '-p', 'TCP'], {
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true
      });
      return parseWindowsNetstatPorts(stdout, pid);
    }

    try {
      const { stdout } = await execFileAsync('lsof', ['-a', '-p', String(pid), '-iTCP', '-sTCP:LISTEN', '-P', '-n']);
      return parseLsofPorts(stdout);
    } catch (error) {
      logger.debug('ProcessFinder', `lsof failed or returned no ports: ${error.message}`);
      return [];
    }
  }

  async findConnectPort(basePort, discoveredPorts = []) {
    const portsToTry = [...discoveredPorts];
    for (const port of [basePort, basePort + 1, basePort - 1, basePort + 2, basePort + 3]) {
      if (!portsToTry.includes(port)) portsToTry.push(port);
    }

    for (const port of [...new Set(portsToTry)]) {
      if (await this.testPort(port)) return port;
    }
    return null;
  }

  testPort(port) {
    return new Promise(resolve => {
      const req = https.request({
        hostname: '127.0.0.1',
        port,
        path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
        method: 'POST',
        rejectUnauthorized: false,
        timeout: 1500
      }, res => {
        const status = Number(res.statusCode);
        resolve(Number.isFinite(status) && status < 500 && status !== 404);
        req.destroy();
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.write('{}');
      req.end();
    });
  }

  extractCsrfToken(processOutput) {
    const tokenMatch = processOutput.match(/--csrf[_-]token(?:=|\s+)([a-zA-Z0-9-]+)/);
    if (tokenMatch) return tokenMatch[1];
    const uuidMatch = processOutput.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return uuidMatch ? uuidMatch[0] : null;
  }
}

const processFinder = new ProcessFinder();

module.exports = processFinder;
module.exports.ProcessFinder = ProcessFinder;
module.exports.parsePosixProcessList = parsePosixProcessList;
module.exports.parseWindowsProcessList = parseWindowsProcessList;
module.exports.parseLsofPorts = parseLsofPorts;
module.exports.parseWindowsNetstatPorts = parseWindowsNetstatPorts;
module.exports.selectLanguageServerProcess = selectLanguageServerProcess;
