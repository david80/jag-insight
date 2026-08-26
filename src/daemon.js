const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const logger = require('./logger');
const processFinder = require('./process_finder');
const quotaClient = require('./quota_client');
const codexUsage = require('./codex_usage');
const claudeUsage = require('./claude_usage');
const claudeTranscriptUsage = require('./claude_transcript_usage');
const geminiUsage = require('./gemini_usage');

const STORAGE_DIR = process.env.JAG_INSIGHTS_STORAGE_DIR || path.join(os.homedir(), '.jag-insights');
fs.mkdirSync(STORAGE_DIR, { recursive: true });
logger.setStorageDirectory(STORAGE_DIR);
claudeTranscriptUsage.setClaudeTranscriptCacheDirectory(STORAGE_DIR);
geminiUsage.setGeminiCacheDirectory(STORAGE_DIR);

const PID_FILE = path.join(STORAGE_DIR, '.daemon.pid');
const STATUS_FILE = path.join(STORAGE_DIR, 'last_status.json');
const WORKSPACE_PATH = process.env.JAG_INSIGHTS_WORKSPACE || process.argv[3] || process.cwd();

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS, 10) || 30000;

/**
 * Collect external usage data (Claude Code, Codex, Gemini CLI).
 * These do not require a running language server.
 */
async function collectExternalData() {
  const [detectedClaudeQuota, claudeActivity, codexQuota, geminiActivity] = await Promise.all([
    claudeUsage.readClaudeQuota('', '').catch(() => null),
    claudeTranscriptUsage.readClaudeTranscriptUsage().catch(() => null),
    codexUsage.readCodexQuota('').catch(() => null),
    geminiUsage.readGeminiUsage('').catch(() => null)
  ]);

  const claudeCodeQuota = detectedClaudeQuota || { source: 'claude-transcripts', models: [] };
  claudeCodeQuota.activity = claudeActivity;

  return { claudeCodeQuota, codexQuota, geminiActivity };
}

/**
 * Build the unified snapshot written to last_status.json.
 * Merges AG quota data with external source data.
 */
function buildUnifiedSnapshot(agSnapshot, external) {
  return {
    ...agSnapshot,
    external: {
      claudeCode: external.claudeCodeQuota || null,
      codex: external.codexQuota || null,
      gemini: external.geminiActivity || null
    }
  };
}

async function runOnce() {
  logger.info('Daemon', 'Running manual one-time quota check...');
  const processInfo = await processFinder.detectProcessInfo(WORKSPACE_PATH);
  if (!processInfo) {
    logger.error('Daemon', 'Could not detect any active Antigravity language server process.');
    process.exit(1);
  }

  try {
    const [agSnapshot, external] = await Promise.all([
      quotaClient.fetchQuota(processInfo.connectPort, processInfo.csrfToken),
      collectExternalData()
    ]);
    const unified = buildUnifiedSnapshot(agSnapshot, external);
    fs.writeFileSync(STATUS_FILE, JSON.stringify(unified, null, 2), 'utf8');
    logger.info('Daemon', `Unified snapshot saved to ${STATUS_FILE}`);
    console.log(JSON.stringify(unified, null, 2));
  } catch (error) {
    logger.error('Daemon', `Fetch failed: ${error.message}`);
    process.exit(1);
  }
}

async function daemonLoop() {
  logger.info('Daemon', 'Background monitoring loop started.');
  while (true) {
    try {
      const processInfo = await processFinder.detectProcessInfo(WORKSPACE_PATH);
      if (processInfo) {
        const [agSnapshot, external] = await Promise.all([
          quotaClient.fetchQuota(processInfo.connectPort, processInfo.csrfToken),
          collectExternalData()
        ]);
        const unified = buildUnifiedSnapshot(agSnapshot, external);
        fs.writeFileSync(STATUS_FILE, JSON.stringify(unified, null, 2), 'utf8');
        logger.debug('Daemon', 'Unified snapshot updated.');
      } else {
        // Language server not running: still update external data so the
        // extension can show Claude Code / Codex / Gemini activity.
        const external = await collectExternalData();
        let existing = {};
        try {
          existing = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        } catch { /* first run or file missing */ }
        existing.external = {
          claudeCode: external.claudeCodeQuota || null,
          codex: external.codexQuota || null,
          gemini: external.geminiActivity || null
        };
        fs.writeFileSync(STATUS_FILE, JSON.stringify(existing, null, 2), 'utf8');
        logger.debug('Daemon', 'External data updated (no language server).');
      }
    } catch (error) {
      logger.error('Daemon', `Loop iteration error: ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
}

function startDaemon() {
  if (fs.existsSync(PID_FILE)) {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    try {
      process.kill(pid, 0); // Check if process exists
      console.log(`Daemon is already running with PID ${pid}.`);
      return;
    } catch (e) {
      // Process is dead, clean up PID file
      fs.unlinkSync(PID_FILE);
    }
  }

  // Spawn background process
  const child = spawn(process.execPath, [__filename, 'run-daemon', WORKSPACE_PATH], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      JAG_INSIGHTS_STORAGE_DIR: STORAGE_DIR,
      JAG_INSIGHTS_WORKSPACE: WORKSPACE_PATH
    }
  });

  fs.writeFileSync(PID_FILE, child.pid.toString(), 'utf8');
  console.log(`Daemon started in background with PID ${child.pid}.`);
  child.unref();
}

function stopDaemon() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('No running daemon found.');
    return;
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Daemon with PID ${pid} stopped.`);
  } catch (e) {
    console.log(`Could not stop daemon (PID ${pid}): ${e.message}`);
  } finally {
    try {
      fs.unlinkSync(PID_FILE);
    } catch (err) {}
  }
}

function checkStatus() {
  if (!fs.existsSync(PID_FILE)) {
    console.log('Daemon status: STOPPED');
    return;
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
  try {
    process.kill(pid, 0);
    console.log(`Daemon status: RUNNING (PID ${pid})`);
  } catch (e) {
    console.log(`Daemon status: STOPPED (Stale PID file found for PID ${pid})`);
    try {
      fs.unlinkSync(PID_FILE);
    } catch (err) {}
  }
}

// CLI Routing
const command = process.argv[2] || 'run-once';

switch (command) {
  case 'start':
    startDaemon();
    break;
  case 'stop':
    stopDaemon();
    break;
  case 'status':
    checkStatus();
    break;
  case 'run-once':
    runOnce();
    break;
  case 'run-daemon':
    daemonLoop();
    break;
  default:
    console.log('Usage: node daemon.js [start|stop|status|run-once]');
    process.exit(1);
}
