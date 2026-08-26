const vscode = require('vscode');
const path = require('path');
const processFinder = require('./process_finder');
const quotaClient = require('./quota_client');
const { installClaudeCapture } = require('./claude_capture_installer');
const { DEFAULT_STATUS_BAR_FORMAT } = require('./status_summary');
const StatusBarManager = require('./status_bar');
const { readCodexQuota, resolveSessionPath, resolveArchivePath } = require('./codex_usage');
const { readClaudeQuota, resolveHomePath } = require('./claude_usage');
const {
  readClaudeTranscriptUsage,
  defaultTranscriptRoots,
  setClaudeTranscriptCacheDirectory
} = require('./claude_transcript_usage');
const {
  readGeminiUsage,
  defaultSessionRoots,
  setGeminiCacheDirectory
} = require('./gemini_usage');
const { fresh, stale, unavailable } = require('./provider_state');
const logger = require('./logger');

let pollingTimer = null;
let pollingGeneration = 0;
let updateInFlight = null;
let statusBarManager = null;
let lastSnapshot = null;
let watcherDisposables = [];
let watcherDebounceTimer = null;
const lastGood = { antigravity: null, claudeCode: null, codex: null, gemini: null };

function getConfig() {
  const config = vscode.workspace.getConfiguration('jagInsights');
  return {
    enabled: config.get('enabled', true),
    pollIntervalMs: config.get('pollIntervalMs', 30000),
    freshnessThresholdMs: config.get('freshnessThresholdMs', 120000),
    showUserEmail: config.get('showUserEmail', true),
    showPromptCredits: config.get('showPromptCredits', true),
    showQuotaOnStatusBar: config.get('showQuotaOnStatusBar', true),
    statusBarFormat: config.get('statusBarFormat', DEFAULT_STATUS_BAR_FORMAT),
    claudeCodeUsagePath: config.get('claudeCodeUsagePath', '~/.claude/jag-insights-usage.json'),
    claudeCodeStatePath: config.get('claudeCodeStatePath', ''),
    codexSessionPath: config.get('codexSessionPath', ''),
    codexUseAppServer: config.get('codexUseAppServer', false),
    codexAppServerCommand: config.get('codexAppServerCommand', 'codex'),
    geminiSessionPath: config.get('geminiSessionPath', ''),
    geminiTelemetryPath: config.get('geminiTelemetryPath', '')
  };
}

async function settledRead(read) {
  try {
    return { data: await read(), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

async function collectExternalData(config) {
  const [detectedClaude, claudeActivity, codex, gemini] = await Promise.all([
    settledRead(() => readClaudeQuota(config.claudeCodeUsagePath || '', config.claudeCodeStatePath || '')),
    settledRead(() => readClaudeTranscriptUsage()),
    settledRead(() => readCodexQuota(config.codexSessionPath || '', {
      useAppServer: config.codexUseAppServer,
      appServerCommand: config.codexAppServerCommand
    })),
    settledRead(() => readGeminiUsage(config.geminiSessionPath || '', config.geminiTelemetryPath || ''))
  ]);

  const claudeCode = detectedClaude.data
    ? { ...detectedClaude.data, activity: claudeActivity.data }
    : claudeActivity.data ? {
        source: 'claude-transcripts',
        timestamp: claudeActivity.data && claudeActivity.data.timestamp,
        models: [],
        activity: claudeActivity.data
      } : null;
  return {
    claudeCode: { data: claudeCode, error: detectedClaude.error || claudeActivity.error },
    codex,
    gemini
  };
}

function materialize(provider, outcome, now, staleAfterMs) {
  if (outcome && outcome.data) {
    const value = fresh(provider, outcome.data, now, staleAfterMs);
    lastGood[provider] = value;
    return value;
  }
  if (lastGood[provider]) {
    return stale(provider, lastGood[provider], outcome && outcome.error ? outcome.error : 'No current data');
  }
  if (outcome && outcome.error) return stale(provider, null, outcome.error);
  return unavailable(provider);
}

function stopWatchers() {
  for (const disposable of watcherDisposables) {
    try { disposable.dispose(); } catch {}
  }
  watcherDisposables = [];
  if (watcherDebounceTimer) clearTimeout(watcherDebounceTimer);
  watcherDebounceTimer = null;
}

function addWatcher(basePath, pattern, onChange) {
  if (!basePath) return;
  try {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(basePath), pattern)
    );
    watcher.onDidCreate(onChange);
    watcher.onDidChange(onChange);
    watcher.onDidDelete(onChange);
    watcherDisposables.push(watcher);
  } catch (error) {
    logger.debug('Watcher', `Could not watch ${basePath}: ${error.message}`);
  }
}

function startWatchers(config, refresh) {
  stopWatchers();
  const debounceRefresh = () => {
    if (watcherDebounceTimer) clearTimeout(watcherDebounceTimer);
    watcherDebounceTimer = setTimeout(() => refresh(), 500);
  };

  const codexSessions = resolveSessionPath(config.codexSessionPath || '');
  addWatcher(codexSessions, '**/rollout-*.jsonl', debounceRefresh);
  addWatcher(resolveArchivePath(codexSessions), 'rollout-*.jsonl', debounceRefresh);

  const claudeUsagePath = resolveHomePath(
    config.claudeCodeUsagePath || '~/.claude/jag-insights-usage.json'
  );
  if (claudeUsagePath) addWatcher(path.dirname(claudeUsagePath), path.basename(claudeUsagePath), debounceRefresh);
  for (const root of defaultTranscriptRoots()) addWatcher(root, '**/*.jsonl', debounceRefresh);

  for (const root of defaultSessionRoots(config.geminiSessionPath || '')) addWatcher(root, '**/*', debounceRefresh);
  if (config.geminiTelemetryPath) {
    const telemetryPath = resolveHomePath(config.geminiTelemetryPath);
    addWatcher(path.dirname(telemetryPath), path.basename(telemetryPath), debounceRefresh);
  }
}

async function activate(context) {
  logger.info('Extension', 'JAG Insights extension activated.');
  const storageUri = context.storageUri || context.globalStorageUri;
  if (storageUri && storageUri.fsPath) {
    logger.setStorageDirectory(storageUri.fsPath);
    setClaudeTranscriptCacheDirectory(storageUri.fsPath);
    setGeminiCacheDirectory(storageUri.fsPath);
  }

  statusBarManager = new StatusBarManager();
  context.subscriptions.push(statusBarManager);

  async function performUpdate() {
    const config = getConfig();
    if (!config.enabled) {
      statusBarManager.hide();
      return;
    }
    const now = new Date();
    const staleAfterMs = Math.max(config.freshnessThresholdMs, config.pollIntervalMs * 3);
    const workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
    const workspacePath = workspaceFolder ? workspaceFolder.uri.fsPath : undefined;
    const [processOutcome, external] = await Promise.all([
      settledRead(() => processFinder.detectProcessInfo(workspacePath)),
      collectExternalData(config)
    ]);

    let agOutcome = {
      data: null,
      error: processOutcome.error || (!processOutcome.data ? new Error('Antigravity language server not found') : null)
    };
    if (processOutcome.data) {
      agOutcome = await settledRead(() => quotaClient.fetchQuota(
        processOutcome.data.connectPort,
        processOutcome.data.csrfToken
      ));
    }
    const antigravity = materialize('antigravity', agOutcome, now, staleAfterMs);
    const claudeCode = materialize('claudeCode', external.claudeCode, now, staleAfterMs);
    const codex = materialize('codex', external.codex, now, staleAfterMs);
    const gemini = materialize('gemini', external.gemini, now, staleAfterMs);

    lastSnapshot = {
      timestamp: antigravity.timestamp || now.toISOString(),
      email: antigravity.email || 'Unknown User',
      promptCredits: antigravity.promptCredits || null,
      models: antigravity.models || [],
      health: antigravity.health,
      external: { claudeCode, codex, gemini }
    };
    statusBarManager.update(lastSnapshot, config, claudeCode, codex, gemini);
  }

  function updateQuota() {
    if (updateInFlight) return updateInFlight;
    updateInFlight = performUpdate()
      .catch(error => {
        logger.error('Extension', `Quota update failed: ${error.message}`);
        if (!lastSnapshot) statusBarManager.showError('Update failed');
      })
      .finally(() => { updateInFlight = null; });
    return updateInFlight;
  }

  function stopPolling() {
    pollingGeneration += 1;
    if (pollingTimer) clearTimeout(pollingTimer);
    pollingTimer = null;
    stopWatchers();
  }

  function startPolling() {
    stopPolling();
    const config = getConfig();
    if (!config.enabled) {
      statusBarManager.hide();
      return;
    }
    const generation = pollingGeneration;
    startWatchers(config, updateQuota);
    const loop = async () => {
      await updateQuota();
      if (generation !== pollingGeneration) return;
      const current = getConfig();
      pollingTimer = setTimeout(loop, Math.max(current.pollIntervalMs, 5000));
    };
    void loop();
  }

  startPolling();

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration('jagInsights')) return;
    lastGood.claudeCode = null;
    lastGood.codex = null;
    lastGood.gemini = null;
    startPolling();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('jagInsights.installClaudeCapture', async () => {
    try {
      const result = await installClaudeCapture(context.extensionPath);
      if (result.conflict) {
        vscode.window.showWarningMessage('Claude Code already has a custom statusLine command. JAG Insights left it unchanged.');
        return;
      }
      vscode.window.showInformationMessage('Claude Code usage capture installed. Send one Claude Code message to populate usage.');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to install Claude Code usage capture: ${error.message}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('jagInsights.refresh', () => vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Refreshing JAG Insights Quota...',
      cancellable: false
    },
    updateQuota
  )));

  context.subscriptions.push(vscode.commands.registerCommand('jagInsights.showDetails', () => {
    statusBarManager.showDetailsPanel(lastSnapshot, getConfig());
  }));

  context.subscriptions.push({ dispose: stopPolling });
}

function deactivate() {
  pollingGeneration += 1;
  if (pollingTimer) clearTimeout(pollingTimer);
  pollingTimer = null;
  stopWatchers();
}

module.exports = { activate, deactivate, collectExternalData };
