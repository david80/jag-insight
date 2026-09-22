# Changelog

## 1.3.6

- Show Claude Code's five-hour usage in the status bar, falling back to another valid window when needed.
- Keep a valid cached Claude Code percentage visible with a history marker when the cache is stale, instead of replacing it with the seven-day token count.

## 1.3.5

- Fixed Claude Code's local usage cache interpreting 1% as 100% for the five-hour limit.
- Stopped showing stale Codex and Claude Code percentages as current usage in the status bar.

## 1.3.4

- Restored remaining quota for the Antigravity segment, so each half of the status bar matches the direction its own tool uses: `AG(...)` counts down like the Antigravity UI, while `Codex:` and `Claude Code:` count up like `/usage`.
- Added a direction legend to the tooltip and a `· remaining` / `· used` suffix to every group heading, so the two halves never read as the same measure.
- Kept warning and error backgrounds driven by usage in both directions, so both halves still warn at the same point.

## 1.3.3

- Switched every displayed percentage from remaining quota to consumption, so the numbers match Claude Code's `/usage` panel and the Codex rate-limit output.
- Each provider is now summarized by its most consumed window, the one that will exhaust first.
- Gauge bars now fill with consumption, and the detail panel reads `93% used` instead of `7% remaining`.
- Moved the status bar warning background to 60% used and the error background to 99.9% used, preserving the previous trigger points.
- Added a single `usedPercentageOf` converter so providers that only report a remaining share are normalized in one place.

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
