const vscode = require('vscode');
const processFinder = require('./process_finder');
const quotaClient = require('./quota_client');
const { installClaudeCapture } = require('./claude_capture_installer');
const { DEFAULT_STATUS_BAR_FORMAT } = require('./status_summary');
const StatusBarManager = require('./status_bar');
const fssync = require('fs');
const path = require('path');
const { readCodexQuota, resolveSessionPath } = require('./codex_usage');
const { readClaudeQuota, resolveHomePath } = require('./claude_usage');
const { readClaudeTranscriptUsage } = require('./claude_transcript_usage');
const { readGeminiUsage } = require('./gemini_usage');
const logger = require('./logger');

let pollingTimer = null;
let statusBarManager = null;
let lastSnapshot = null;

// Real-time Codex watcher state
let codexWatcher = null;
let codexDebounceTimer = null;
let liveCodexQuota = null; // Most recent quota read directly from session files

// Real-time Claude Code watcher state
let claudeCodeFileWatcher = null;
let claudeCodeDebounceTimer = null;
let liveClaudeCodeQuota = null; // Most recent quota read from jag-insights-usage.json

function getConfig() {
  const config = vscode.workspace.getConfiguration('jagInsights');
  return {
    enabled: config.get('enabled', true),
    pollIntervalMs: config.get('pollIntervalMs', 30000),
    showUserEmail: config.get('showUserEmail', true),
    showPromptCredits: config.get('showPromptCredits', true),
    showQuotaOnStatusBar: config.get('showQuotaOnStatusBar', true),
    statusBarFormat: config.get('statusBarFormat', DEFAULT_STATUS_BAR_FORMAT),
    claudeCodeUsagePath: config.get('claudeCodeUsagePath', '~/.claude/jag-insights-usage.json'),
    claudeCodeStatePath: config.get('claudeCodeStatePath', ''),
    codexSessionPath: config.get('codexSessionPath', ''),
    codexStatePath: config.get('codexStatePath', ''),
    geminiSessionPath: config.get('geminiSessionPath', '')
  };
}

/**
 * Extract external data from the current in-memory snapshot.
 */
function extractExternalData(snapshot) {
  const ext = snapshot && snapshot.external;
  if (!ext) {
    return { claudeCodeQuota: null, codexQuota: null, geminiActivity: null };
  }
  return {
    claudeCodeQuota: ext.claudeCode || null,
    codexQuota: ext.codex || null,
    geminiActivity: ext.gemini || null
  };
}

/**
 * Collect external CLI quota/activity using the configured, platform-safe paths.
 */
async function collectExternalData(config) {
  const [detectedClaudeQuota, claudeActivity, codexQuota, geminiActivity] = await Promise.all([
    readClaudeQuota(config.claudeCodeUsagePath || '', config.claudeCodeStatePath || '').catch(() => null),
    readClaudeTranscriptUsage().catch(() => null),
    readCodexQuota(config.codexSessionPath || '').catch(() => null),
    readGeminiUsage(config.geminiSessionPath || '').catch(() => null)
  ]);

  const claudeCodeQuota = detectedClaudeQuota
    ? { ...detectedClaudeQuota, activity: claudeActivity }
    : { source: 'claude-transcripts', models: [], activity: claudeActivity };

  return { claudeCodeQuota, codexQuota, geminiActivity };
}

/**
 * Resolve today's (and yesterday's) Codex session directory paths to watch.
 * Codex organises sessions under ~/.codex/sessions/YYYY/MM/DD/.
 */
function resolveCodexWatchDirs(customPath) {
  const sessionPath = resolveSessionPath(customPath || '');
  const dirs = [];
  const now = new Date();
  for (let d = 0; d <= 1; d++) {
    const date = new Date(now);
    date.setDate(now.getDate() - d);
    const y = String(date.getFullYear());
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    dirs.push(path.join(sessionPath, y, m, day));
  }
  return dirs;
}

/**
 * Start watching Codex session directories for real-time JSONL updates.
 * When a rollout-*.jsonl file changes, read the latest token_count and
 * immediately refresh the status bar (debounced 500 ms).
 */
function startCodexWatcher(config, getUpdatedSnapshot) {
  stopCodexWatcher();

  const dirs = resolveCodexWatchDirs(config.codexSessionPath);

  for (const dir of dirs) {
    if (!fssync.existsSync(dir)) continue;

    try {
      const watcher = fssync.watch(dir, { persistent: false }, (eventType, filename) => {
        if (!filename || !filename.startsWith('rollout-') || !filename.endsWith('.jsonl')) return;

        // Debounce: wait 500 ms after the last write before re-reading
        if (codexDebounceTimer) clearTimeout(codexDebounceTimer);
        codexDebounceTimer = setTimeout(async () => {
          try {
            const fresh = await readCodexQuota(config.codexSessionPath || '');
            if (fresh) {
              liveCodexQuota = fresh;
              getUpdatedSnapshot();
            }
          } catch (_) { /* ignore read errors */ }
        }, 500);
      });

      watcher.on('error', () => { /* ignore ENOENT / EPERM on dir removal */ });
      if (!codexWatcher) codexWatcher = [];
      codexWatcher.push(watcher);
    } catch (_) { /* directory may not exist yet */ }
  }

  if (codexWatcher && codexWatcher.length > 0) {
    console.log(`JAG Insights: Watching ${codexWatcher.length} Codex session dir(s) for real-time updates.`);
  }
}

function stopCodexWatcher() {
  if (codexWatcher) {
    for (const w of codexWatcher) {
      try { w.close(); } catch (_) {}
    }
    codexWatcher = null;
  }
  if (codexDebounceTimer) {
    clearTimeout(codexDebounceTimer);
    codexDebounceTimer = null;
  }
}

/**
 * Watch ~/.claude/jag-insights-usage.json for real-time Claude Code quota updates.
 * Claude Code's statusLine hook writes this file on every response — giving us
 * accurate five_hour / seven_day used_percentage values the moment they change.
 */
function startClaudeCodeWatcher(config, onUpdate) {
  stopClaudeCodeWatcher();

  // Resolve the configured usage file path (defaults to ~/.claude/jag-insights-usage.json)
  const usagePath = resolveHomePath(
    config.claudeCodeUsagePath || '~/.claude/jag-insights-usage.json'
  );
  if (!usagePath) return;

  // Watch the parent directory — file watchers on non-existent files are unreliable
  const watchDir = path.dirname(usagePath);
  const watchFile = path.basename(usagePath);

  if (!fssync.existsSync(watchDir)) return;

  try {
    claudeCodeFileWatcher = fssync.watch(watchDir, { persistent: false }, (eventType, filename) => {
      if (filename !== watchFile) return;

      if (claudeCodeDebounceTimer) clearTimeout(claudeCodeDebounceTimer);
      claudeCodeDebounceTimer = setTimeout(async () => {
        try {
          const fresh = await readClaudeQuota(usagePath, '');
          if (fresh && fresh.models && fresh.models.some(m => !m.isOutdated)) {
            liveClaudeCodeQuota = fresh;
            console.log('JAG Insights: Claude Code quota updated in real-time.');
            onUpdate();
          }
        } catch (_) { /* ignore read errors */ }
      }, 300);
    });

    claudeCodeFileWatcher.on('error', () => {
      try { claudeCodeFileWatcher && claudeCodeFileWatcher.close(); } catch (_) {}
      claudeCodeFileWatcher = null;
    });

    console.log(`JAG Insights: Watching ${usagePath} for real-time Claude Code quota updates.`);
  } catch (_) { /* dir watch may fail in some environments */ }
}

function stopClaudeCodeWatcher() {
  if (claudeCodeFileWatcher) {
    try { claudeCodeFileWatcher.close(); } catch (_) {}
    claudeCodeFileWatcher = null;
  }
  if (claudeCodeDebounceTimer) {
    clearTimeout(claudeCodeDebounceTimer);
    claudeCodeDebounceTimer = null;
  }
}

async function activate(context) {
  console.log('JAG Insights extension is now active!');

  const storageUri = context.storageUri || context.globalStorageUri;
  if (storageUri && storageUri.fsPath) {
    logger.setStorageDirectory(storageUri.fsPath);
  }

  statusBarManager = new StatusBarManager();
  context.subscriptions.push(statusBarManager);

  async function updateQuota() {
    const config = getConfig();
    if (!config.enabled) {
      statusBarManager.hide();
      return;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
    const workspacePath = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;
    const [processInfo, external] = await Promise.all([
      processFinder.detectProcessInfo(workspacePath),
      collectExternalData(config)
    ]);

    let agSnapshot = null;
    try {
      if (processInfo) {
        agSnapshot = await quotaClient.fetchQuota(processInfo.connectPort, processInfo.csrfToken);
      }
    } catch (_) {
      // Keep the last successful Antigravity snapshot while external quotas refresh.
    }

    if (!agSnapshot && lastSnapshot) {
      agSnapshot = {
        timestamp: lastSnapshot.timestamp,
        email: lastSnapshot.email,
        promptCredits: lastSnapshot.promptCredits,
        models: lastSnapshot.models || []
      };
    }

    if (!agSnapshot) {
      agSnapshot = {
        timestamp: new Date().toISOString(),
        email: 'Unknown User',
        promptCredits: null,
        models: []
      };
    }

    lastSnapshot = {
      ...agSnapshot,
      external: {
        claudeCode: external.claudeCodeQuota,
        codex: external.codexQuota,
        gemini: external.geminiActivity
      }
    };

    const effectiveCodexQuota = liveCodexQuota || external.codexQuota;
    const effectiveClaudeQuota = liveClaudeCodeQuota
      ? { ...liveClaudeCodeQuota, activity: external.claudeCodeQuota.activity || null }
      : external.claudeCodeQuota;
    statusBarManager.update(lastSnapshot, config, effectiveClaudeQuota, effectiveCodexQuota, external.geminiActivity);
  }

  function startPolling() {
    if (pollingTimer) {
      clearInterval(pollingTimer);
    }
    const config = getConfig();
    updateQuota();
    pollingTimer = setInterval(updateQuota, Math.max(config.pollIntervalMs, 5000));

    // (Re)start real-time Codex watcher whenever polling restarts
    startCodexWatcher(config, () => {
      const cfg = getConfig();
      if (!lastSnapshot || !cfg.showQuotaOnStatusBar) return;
      const { claudeCodeQuota, geminiActivity } = extractExternalData(lastSnapshot);
      const effectiveClaudeQuota = liveClaudeCodeQuota
        ? { ...liveClaudeCodeQuota, activity: (claudeCodeQuota && claudeCodeQuota.activity) || null }
        : (claudeCodeQuota ? { ...claudeCodeQuota } : { source: 'claude-transcripts', models: [] });
      statusBarManager.update(lastSnapshot, cfg, effectiveClaudeQuota, liveCodexQuota, geminiActivity);
    });

    // (Re)start real-time Claude Code watcher
    startClaudeCodeWatcher(config, () => {
      const cfg = getConfig();
      if (!lastSnapshot || !cfg.showQuotaOnStatusBar) return;
      const { claudeCodeQuota, codexQuota, geminiActivity } = extractExternalData(lastSnapshot);
      const effectiveCodexQuota = liveCodexQuota || codexQuota;
      const effectiveClaudeQuota = liveClaudeCodeQuota
        ? { ...liveClaudeCodeQuota, activity: (claudeCodeQuota && claudeCodeQuota.activity) || null }
        : (claudeCodeQuota ? { ...claudeCodeQuota } : { source: 'claude-transcripts', models: [] });
      statusBarManager.update(lastSnapshot, cfg, effectiveClaudeQuota, effectiveCodexQuota, geminiActivity);
    });
  }

  startPolling();

  // React to configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('jagInsights')) {
        const config = getConfig();
        if (!config.enabled) {
          statusBarManager.hide();
        } else {
          startPolling();
        }
      }
    })
  );

  // Command: install Claude Code statusline capture hook
  context.subscriptions.push(
    vscode.commands.registerCommand('jagInsights.installClaudeCapture', async () => {
      try {
        const result = await installClaudeCapture(context.extensionPath);
        if (result.conflict) {
          vscode.window.showWarningMessage(
            'Claude Code already has a custom statusLine command. JAG Insights left it unchanged.'
          );
          return;
        }
        vscode.window.showInformationMessage(
          'Claude Code usage capture installed. Send one Claude Code message to populate usage.'
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to install Claude Code usage capture: ${error.message}`);
      }
    })
  );

  // Command: manual refresh
  context.subscriptions.push(
    vscode.commands.registerCommand('jagInsights.refresh', async () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Refreshing JAG Insights Quota...',
          cancellable: false
        },
        async () => {
          await updateQuota();
        }
      );
    })
  );

  // Command: show details panel
  context.subscriptions.push(
    vscode.commands.registerCommand('jagInsights.showDetails', () => {
      const config = getConfig();
      statusBarManager.showDetailsPanel(lastSnapshot, config);
    })
  );
}

function deactivate() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
  stopCodexWatcher();
  stopClaudeCodeWatcher();
}

module.exports = {
  activate,
  deactivate
};
