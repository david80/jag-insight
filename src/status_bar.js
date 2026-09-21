const vscode = require('vscode');
const {
  DEFAULT_STATUS_BAR_FORMAT,
  summarizeQuotas,
  formatStatusBarSegments,
  categorizeModels,
  usedPercentageOf,
  remainingPercentageOf
} = require('./status_summary');

// Thresholds are always compared as consumption, whichever direction a group
// is displayed in, so both halves of the status bar warn at the same point.
const WARNING_USED_PERCENTAGE = 60;
const EXHAUSTED_USED_PERCENTAGE = 99.9;
const DIRECTION_LEGEND = 'AG shows remaining quota · Codex and Claude Code show usage';
const { estimatePeriodCost, formatCost } = require('./cost_estimator');
const { formatAge } = require('./provider_state');

function safeDisplayText(value, maxLength = 80) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function escapeMarkdown(value) {
  return safeDisplayText(value).replace(/[\\`*_{}\[\]()<>#+.!|~-]/g, '\\$&');
}

class StatusBarManager {
  constructor() {
    this.items = {
      antigravity: this.createStatusBarItem(102),
      codex: this.createStatusBarItem(101),
      claudeCode: this.createStatusBarItem(100)
    };
    this.items.antigravity.text = '$(hubot) JAG Insights';
    this.items.antigravity.show();
    this.lastSnapshot = null;
    this.claudeCodeQuota = null;
    this.codexQuota = null;
    this.geminiActivity = null;
  }

  createStatusBarItem(priority) {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, priority);
    item.command = 'jagInsights.showDetails';
    item.tooltip = 'Click to view quota details';
    return item;
  }

  dispose() {
    for (const item of Object.values(this.items)) item.dispose();
  }

  showError(msg) {
    this.hide();
    const item = this.items.antigravity;
    item.text = '$(error) JAG Insights';
    item.tooltip = `Error: ${msg}`;
    item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    item.show();
  }

  /**
   * @param {object} snapshot      - AG quota snapshot (from last_status.json)
   * @param {object} config        - extension configuration
   * @param {object} claudeCodeQuota - Claude Code usage data
   * @param {object} codexQuota    - Codex usage data
   * @param {object} geminiActivity - Gemini CLI activity data (new)
   */
  update(snapshot, config, claudeCodeQuota, codexQuota, geminiActivity) {
    if (!config.enabled) {
      this.hide();
      return;
    }

    this.lastSnapshot = snapshot;
    this.claudeCodeQuota = claudeCodeQuota;
    this.codexQuota = codexQuota;
    this.geminiActivity = geminiActivity;

    const models = (snapshot && snapshot.models) || [];
    const summary = summarizeQuotas(models, codexQuota, claudeCodeQuota, geminiActivity);
    const tooltip = this.buildTooltip(snapshot, config);

    if (!config.showQuotaOnStatusBar) {
      this.hide();
      const item = this.items.antigravity;
      item.text = '$(hubot) JAG Insights';
      item.tooltip = tooltip;
      item.backgroundColor = undefined;
      item.show();
      return;
    }

    const text = formatStatusBarSegments(config.statusBarFormat || DEFAULT_STATUS_BAR_FORMAT, summary);
    const agMaximums = [summary.antigravity, summary.antigravityCodex, summary.antigravityClaude]
      .filter(value => value !== null);
    const percentages = {
      antigravity: agMaximums.length > 0 ? Math.max(...agMaximums) : null,
      codex: summary.codex,
      claudeCode: summary.claudeCode
    };

    for (const [provider, item] of Object.entries(this.items)) {
      item.text = text[provider];
      const providerData = provider === 'antigravity'
        ? snapshot
        : provider === 'codex' ? codexQuota : claudeCodeQuota;
      if (item.text && providerData && providerData.health && providerData.health.status === 'stale') {
        item.text += ' $(history)';
      }
      item.tooltip = tooltip;
      item.backgroundColor = this.getStatusBackground(percentages[provider]);
      if (item.text) item.show();
      else item.hide();
    }
  }

  hide() {
    for (const item of Object.values(this.items)) item.hide();
  }

  getStatusBackground(usedPercentage) {
    if (usedPercentage === null || !Number.isFinite(usedPercentage)) return undefined;
    if (usedPercentage >= EXHAUSTED_USED_PERCENTAGE) {
      return new vscode.ThemeColor('statusBarItem.errorBackground');
    }
    if (usedPercentage >= WARNING_USED_PERCENTAGE) {
      return new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    return undefined;
  }

  buildTooltip(snapshot, config) {
    const md = new vscode.MarkdownString();
    md.isTrusted = {
      enabledCommands: ['jagInsights.refresh', 'workbench.action.openSettings']
    };
    md.supportHtml = false;
    md.supportThemeIcons = true;

    md.appendMarkdown('\n### $(hubot) JAG User Insights\n');

    if (config.showUserEmail && snapshot.email) {
      md.appendMarkdown(`\n$(person) **User**: ${escapeMarkdown(snapshot.email)}\n`);
    }

    if (config.showPromptCredits && snapshot.promptCredits) {
      const { available, monthly, remainingPercentage } = snapshot.promptCredits;
      const pct = remainingPercentage.toFixed(0);
      md.appendMarkdown(`\n$(pulse) **Prompt Credits**: ${available} / ${monthly} (${pct}%)`);
    }

    md.appendMarkdown('\n\n');

    const states = [
      this.formatHealth('AG', snapshot),
      this.formatHealth('Codex', this.codexQuota),
      this.formatHealth('Claude Code', this.claudeCodeQuota),
      this.formatHealth('Gemini CLI', this.geminiActivity)
    ].filter(Boolean);
    if (states.length > 0) md.appendMarkdown(`$(info) ${states.map(state => escapeMarkdown(state)).join(' · ')}\n\n`);

    md.appendMarkdown(`$(arrow-swap) ${escapeMarkdown(DIRECTION_LEGEND)}\n\n`);

    md.appendCodeblock(this.buildQuotaTable(snapshot.models, this.claudeCodeQuota, this.codexQuota, this.geminiActivity), 'diff');
    md.appendMarkdown('\n\n');

    // Footer
    md.appendMarkdown('\n| | |\n|:---|---:|\n');
    const localTimeStr = new Date(snapshot.timestamp).toLocaleTimeString('ko-KR');
    md.appendMarkdown(`| [ $(refresh) REFRESH ](command:jagInsights.refresh) \u00A0 [ $(gear) CONFIG ](command:workbench.action.openSettings?%22jagInsights%22) | $(clock) ${localTimeStr} |`);
    md.appendMarkdown('\n');

    return md;
  }

  /**
   * Confidence label: indicates data reliability.
   *   official  = captured directly from Claude Code's rate_limit statusline
   *   estimated = computed from local JSONL transcripts
   */
  getConfidenceLabel(source) {
    if (!source) return '';
    if (source === 'claude-statusline' || source === 'claude-usage-cache') return ' [official]';
    if (source === 'claude-local-cache') return ' [local cache]';
    if (source === 'claude-transcripts') return ' [estimated]';
    if (source === 'codex-sessions') return ' [sessions]';
    if (source === 'codex-app-server') return ' [app-server]';
    if (source === 'gemini-sessions') return ' [sessions]';
    if (source === 'gemini-telemetry') return ' [telemetry]';
    return '';
  }

  formatHealth(label, data) {
    const state = data && data.health;
    if (!state) return '';
    const age = state.fetchedAt ? ` ${formatAge(state.fetchedAt)}` : '';
    let detail = '';
    const activity = data && data.activity;
    if (label === 'Claude Code' && activity && activity.available !== false
        && activity.last7Days && Number(activity.last7Days.totalTokens) === 0) {
      detail = activity.latestTranscriptAt
        ? `, no activity in 7d (last transcript ${formatAge(activity.latestTranscriptAt)})`
        : ', no activity in 7d';
    }
    return `${label}: ${state.status}${age}${detail}`;
  }

  buildQuotaTable(models, claudeCodeQuota, codexQuota, geminiActivity) {
    let output = '';

    const formatGroup = (groupName, groupModels) => {
      if (!groupModels || groupModels.length === 0) return '';
      let str = ` -- [ ${groupName} · remaining ] -----------------\n`;
      for (const m of groupModels) {
        const remaining = remainingPercentageOf(m) ?? 0;
        const indicator = remaining > 100 - WARNING_USED_PERCENTAGE ? '+' : '-';
        const bar = this.getProgressBar(remaining);
        const displayValue = `${remaining.toFixed(0)}%`;
        const paddedLabel = safeDisplayText(m.label, 25).padEnd(25);
        str += `${indicator} ${paddedLabel} | ${bar} | ${displayValue.padEnd(4)} | ${m.timeUntilResetFormatted}\n`;
      }
      return str;
    };

    const formatExternalGroup = (groupName, quota) => {
      if (!quota || !quota.models || quota.models.length === 0) return '';
      const confidenceLabel = this.getConfidenceLabel(quota.source);
      const healthLabel = quota.health && quota.health.status !== 'fresh'
        ? ` [${safeDisplayText(quota.health.status, 12)}]`
        : '';
      let str = ` -- [ ${groupName} · used${confidenceLabel}${healthLabel} ] -----------------\n`;
      for (const m of quota.models) {
        const ccPct = usedPercentageOf(m) ?? 100;
        const ccBar = this.getProgressBar(ccPct);
        const indicator = ccPct < WARNING_USED_PERCENTAGE ? '+' : '-';
        const displayValue = `${ccPct.toFixed(0)}%`;
        const resetsAt = m.resetsAt;
        let resetFormatted = m.isOutdated ? 'Outdated' : 'Ready';
        if (resetsAt) {
          const resetDate = new Date(resetsAt);
          const now = new Date();
          const diff = resetDate.getTime() - now.getTime();
          if (diff > 0) {
            const mins = Math.ceil(diff / 60000);
            if (mins < 60) {
              resetFormatted = `${mins}m`;
            } else {
              resetFormatted = `${Math.floor(mins / 60)}h ${mins % 60}m`;
            }
            const dateStr = resetDate.toLocaleDateString('ko-KR', {
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
            resetFormatted += ` (${dateStr})`;
          }
        }
        const paddedLabel = safeDisplayText(m.label, 25).padEnd(25);
        str += `${indicator} ${paddedLabel} | ${ccBar} | ${displayValue.padEnd(4)} | ${resetFormatted}\n`;
      }
      return str;
    };

    const formatTokenCount = (value) => {
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
      return String(value || 0);
    };

    const formatGeminiActivity = (activity) => {
      if (!activity || !activity.last7Days || activity.last7Days.totalTokens === 0) return '';
      const line = (label, period) => {
        const costStr = formatCost(estimatePeriodCost(period));
        const renderedCost = costStr === 'Unpriced' ? costStr : `≈ ${costStr}`;
        return `+ ${label.padEnd(25)} | ${formatTokenCount(period.totalTokens).padStart(7)} tokens | ${String(period.turns).padStart(4)} turns | ${renderedCost}\n`;
      };
      let str = ' -- [ Gemini CLI Activity ] ----------\n';
      str += line('Last 24 Hours', activity.last24Hours);
      str += line('Last 7 Days', activity.last7Days);
      return str;
    };

    const categories = categorizeModels(models);
    // Keep the tooltip hierarchy and order aligned with the status bar:
    // AG(Gemini, Codex, Claude) | Codex | Claude Code.
    // The `AG ·` prefix marks Antigravity's own model quota, so it never
    // reads as the standalone Codex or Claude Code CLI below it.
    output += formatGroup('AG · Gemini', categories.gemini);
    output += formatGroup('AG · Codex', categories.codex);
    output += formatGroup('AG · Claude', categories.claude);
    output += formatGroup('AG · Others', categories.others);
    output += formatExternalGroup('Codex', codexQuota);
    output += formatExternalGroup('Claude Code', claudeCodeQuota);
    output += formatGeminiActivity(geminiActivity);

    return output;
  }

  getProgressBar(percentage) {
    const totalBars = 10;
    const bounded = Math.max(0, Math.min(100, Number(percentage) || 0));
    const filledBars = Math.round((bounded / 100) * totalBars);
    const emptyBars = totalBars - filledBars;
    return '█'.repeat(filledBars) + '░'.repeat(emptyBars);
  }

  showDetailsPanel(snapshot, config) {
    if (!snapshot) {
      vscode.window.showInformationMessage('No quota data available yet.');
      return;
    }

    const items = [];

    items.push({
      label: '$(hubot) JAG User Insights',
      kind: vscode.QuickPickItemKind.Separator
    });

    if (config.showUserEmail && snapshot.email) {
      items.push({
        label: `$(person) User: ${safeDisplayText(snapshot.email)}`,
        description: ''
      });
    }

    if (config.showPromptCredits && snapshot.promptCredits) {
      const { available, monthly, remainingPercentage } = snapshot.promptCredits;
      const pct = remainingPercentage.toFixed(0);
      items.push({
        label: `$(pulse) Prompt Credits: ${available} / ${monthly}`,
        description: `${pct}% remaining`
      });
    }

    const addGroupToQuickPick = (groupName, groupModels) => {
      if (!groupModels || groupModels.length === 0) return;
      items.push({
        label: groupName,
        kind: vscode.QuickPickItemKind.Separator
      });

      for (const model of groupModels) {
        const remaining = remainingPercentageOf(model) ?? 0;
        const icon = remaining > 100 - WARNING_USED_PERCENTAGE ? '$(check)' : '$(warning)';
        items.push({
          label: `${icon} ${safeDisplayText(model.label)}`,
          description: `${remaining.toFixed(0)}% remaining`,
          detail: `Resets in: ${model.timeUntilResetFormatted}`
        });
      }
    };

    const addExternalToQuickPick = (groupName, quota) => {
      if (!quota || !quota.models || quota.models.length === 0) return;
      const confidenceLabel = this.getConfidenceLabel(quota.source);
      items.push({
        label: `${groupName}${confidenceLabel}`,
        kind: vscode.QuickPickItemKind.Separator
      });

      for (const m of quota.models) {
        const ccPct = usedPercentageOf(m) ?? 100;
        const icon = ccPct < WARNING_USED_PERCENTAGE ? '$(check)' : '$(warning)';
        const resetsAt = m.resetsAt;
        let resetFormatted = m.isOutdated ? 'Outdated' : 'Ready';
        if (resetsAt) {
          const resetDate = new Date(resetsAt);
          const now = new Date();
          const diff = resetDate.getTime() - now.getTime();
          if (diff > 0) {
            const mins = Math.ceil(diff / 60000);
            if (mins < 60) {
              resetFormatted = `${mins}m`;
            } else {
              resetFormatted = `${Math.floor(mins / 60)}h ${mins % 60}m`;
            }
            const dateStr = resetDate.toLocaleDateString('ko-KR', {
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
            resetFormatted += ` (${dateStr})`;
          }
        }
        items.push({
          label: `${icon} ${safeDisplayText(m.label)}`,
          description: `${ccPct.toFixed(0)}% used`,
          detail: `Resets in: ${resetFormatted}`
        });
      }
    };

    const formatTokens = value => value >= 1000000
      ? `${(value / 1000000).toFixed(1)}M`
      : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value || 0);

    const categories = categorizeModels(snapshot.models || []);
    addGroupToQuickPick('AG · Gemini', categories.gemini);
    addGroupToQuickPick('AG · Codex', categories.codex);
    addGroupToQuickPick('AG · Claude', categories.claude);
    addGroupToQuickPick('AG · Others', categories.others);
    addExternalToQuickPick('Codex', this.codexQuota);
    addExternalToQuickPick('Claude Code', this.claudeCodeQuota);

    // Gemini CLI activity section
    if (this.geminiActivity && this.geminiActivity.last7Days && this.geminiActivity.last7Days.totalTokens > 0) {
      const ga = this.geminiActivity;
      items.push({
        label: 'Gemini CLI Activity [sessions]',
        kind: vscode.QuickPickItemKind.Separator
      });
      const g24h = estimatePeriodCost(ga.last24Hours);
      const g7d  = estimatePeriodCost(ga.last7Days);
      items.push({
        label: '$(pulse) Last 24 Hours',
        description: `${formatTokens(ga.last24Hours.totalTokens)} tokens`,
        detail: `${ga.last24Hours.turns} turns · ≈ ${formatCost(g24h)}`
      });
      items.push({
        label: '$(history) Last 7 Days',
        description: `${formatTokens(ga.last7Days.totalTokens)} tokens`,
        detail: `${ga.last7Days.turns} turns · ≈ ${formatCost(g7d)}`
      });
    }

    items.push({
      label: 'Actions',
      kind: vscode.QuickPickItemKind.Separator
    });

    items.push({
      label: '$(refresh) Refresh Quota',
      description: 'Fetch latest quota data'
    });

    items.push({
      label: '$(gear) Settings',
      description: 'Configure JAG Insights'
    });

    const quickPick = vscode.window.createQuickPick();
    quickPick.items = items;
    quickPick.placeholder = 'JAG Insights - Quota Information';
    quickPick.canSelectMany = false;

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      if (selected) {
        if (selected.label.includes('Refresh Quota')) {
          vscode.commands.executeCommand('jagInsights.refresh');
        } else if (selected.label.includes('Settings')) {
          vscode.commands.executeCommand('workbench.action.openSettings', 'jagInsights');
        }
      }
      quickPick.hide();
    });

    quickPick.onDidHide(() => quickPick.dispose());
    quickPick.show();
  }
}

module.exports = StatusBarManager;
module.exports.safeDisplayText = safeDisplayText;
module.exports.escapeMarkdown = escapeMarkdown;
