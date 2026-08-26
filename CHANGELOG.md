# Changelog

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
