# Changelog

## 1.3.2

- Renamed the status bar labels so `CloudCode` no longer means two different things: the Antigravity group now reads `AG(Gemini, Codex, Claude)` and the standalone CLIs read `Codex` and `Claude Code`.
- Renamed the tooltip and detail panel group headings to match (`AG · Gemini`, `AG · Codex`, `AG · Claude`, `Codex`, `Claude Code`) and aligned the detail panel order with the tooltip.
- Spelled out in the settings description and docs that the `AG(...)` group is Antigravity's own quota and that every percentage is remaining, not used.
- Placeholders (`{ag}`, `{agcx}`, `{agcc}`, `{agcl}`, `{cl}`, `{cx}`, `{cc}`) are unchanged, so an explicitly customized `jagInsights.statusBarFormat` keeps working.

## 1.3.1

- Distinguished an available but idle Claude Code source as `0(7d)` instead of `N/A`.
- Added Claude data discovery through `CLAUDE_CONFIG_DIR` and `~/.config/claude`.
- Added Claude transcript discovery diagnostics and last-activity context to the tooltip.
- Added model-scoped weekly Claude limits and robust epoch-second/millisecond reset parsing.
- Hardened the Claude status-line cache with profile-aware paths, unique temporary files, and owner-only permissions.

## 1.3.0

- Added current Gemini CLI session discovery under `~/.gemini/tmp/<project>/chats`, supporting JSON and JSONL.
- Added optional prompt-free local Gemini OpenTelemetry ingestion.
- Added persistent incremental JSONL parsing for Claude and Gemini activity.
- Added Codex archived-session discovery, bounded reverse tail reads, and optional documented app-server rate-limit queries.
- Added provider freshness, stale, unavailable, and error states with last-good fallback.
- Replaced overlapping async intervals with a single-flight completion-based polling loop.
- Replaced raw file watches with VS Code file-system watchers that handle file creation and date rollover.
- Restricted trusted tooltip commands, disabled tooltip HTML, sanitized displayed values, redacted sensitive log metadata, and added log rotation.
- Versioned bundled pricing, separated Claude 5-minute and 1-hour cache writes, and stopped assigning fabricated prices to unknown models.
- Added cross-platform CI, syntax checks, parser fixtures, and reproducible packaging with pinned `@vscode/vsce`.

## 1.2.8

- Previous stable release.
