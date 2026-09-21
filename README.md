# JAG Insights - Status Bar Quota Monitor Extension

[한국어 가이드](#한국어-가이드) | [English Guide](#english-guide)

---

## 한국어 가이드

**안티그래비티 IDE와 Microsoft Visual Studio Code를 모두 지원**하며, IDE의 작업표시줄(상태 표시줄, Status Bar)에 AI 사용 한도와 활동 정보를 실시간으로 표시하는 경량 확장 프로그램(Extension)입니다.

기본 모드에서는 로컬에서 구동되는 언어 서버(Language Server)와 직접 통신(Connect-RPC)하고 Codex 세션 파일을 읽으므로 외부 클라우드 통신이나 CLI(`agy`) 호출 없이 동작하며, 런타임 의존 라이브러리가 필요하지 않습니다. 선택적 Codex app-server 모드를 켠 경우에만 Codex를 통한 네트워크 요청이 발생할 수 있습니다.

macOS와 Windows를 지원합니다. 사용자 홈 경로는 운영체제에 맞게 자동 해석하며, Windows에서는 PowerShell과 `netstat.exe`를 사용해 Antigravity Language Server를 탐지합니다. 로그와 런타임 상태는 확장 프로그램 설치 폴더가 아닌 IDE의 워크스페이스 저장소에 기록됩니다.

Claude Code, Codex, Gemini CLI 사용량은 두 IDE에서 동일하게 동작합니다. Antigravity 전용 AG 모델 쿼터는 Antigravity Language Server가 실행 중일 때 표시되며, 일반 VS Code에서 해당 서버를 찾을 수 없으면 AG 항목만 `N/A`로 표시됩니다.

버전 1.3부터는 공급자별 데이터가 오래되었는지 상태 표시줄과 툴팁에 표시하며, JSONL 파일은 변경된 부분만 증분 처리합니다. Gemini CLI의 최신 프로젝트별 JSON/JSONL 세션 구조도 자동 탐지합니다.

### 🌟 주요 기능

1. **실시간 상태 표시줄 연동**
   - IDE 오른쪽 하단 상태 표시줄에 `🤖 AG(Gemini 27%, Codex 69%, Claude 69%) | Codex:9% | Claude Code:93%` 형태로 노출됩니다.
   - **각 구간은 해당 도구가 자체 UI에 보여주는 방향을 따릅니다.** `AG(...)`는 Antigravity UI와 같은 **잔여량**, `Codex:`와 `Claude Code:`는 `/usage` 패널과 같은 **사용량**입니다. 툴팁과 그룹 머리글에 방향이 명시됩니다.
   - 괄호 안의 `AG(...)`는 **Antigravity IDE가 제공하는 모델 쿼터**이고, 그 뒤의 `Codex:` / `Claude Code:`는 **독립 실행되는 CLI의 자체 쿼터**입니다. 서로 다른 값입니다.
2. **서비스별 그룹화된 마크다운 툴팁 (마우스 호버)**
   - 상태 표시줄에 마우스를 올리면 예쁜 마크다운 형식의 툴팁이 팝업됩니다.
   - 사용자 계정 이메일 및 프롬프트 크레딧 정보 잔량을 퍼센트로 보여줍니다.
   - AI 모델들이 아래 3개 그룹으로 묶여 표시되므로 편리합니다:
     - **AG · Gemini** / **AG · Codex** / **AG · Claude**: Antigravity IDE 모델별 쿼터
     - **Codex**: 로컬 Codex CLI
     - **Claude Code**: 로컬 Claude Code CLI
   - 모델별 사용량 게이지 바(`█████░░░░░ 50%`)와 초기화 일정 정보를 실시간 모니터링할 수 있습니다.
   - 툴팁 내부 링크를 통해 `[ REFRESH ]` 또는 `[ CONFIG ]` 제어가 즉시 가능합니다.
3. **상세 정보 패널 및 액션 (클릭)**
   - 상태 표시줄을 클릭하면 IDE 상단에 깔끔한 **퀵픽(QuickPick)** 메뉴가 나타납니다.
   - 각 AI 모델 정보 목록 확인, 즉시 사용량 새로고침 액션 실행, 설정창 진입을 간편하게 수행할 수 있습니다.

### ⚙️ 설정 구성 (Configuration)

IDE의 `Settings` (설정창, `Cmd+,` 혹은 `Ctrl+,`)에서 `jagInsights`를 검색해 설정을 변경할 수 있습니다:

- **`jagInsights.enabled`**: 상태 표시줄에 모니터를 띄울지 여부 (기본값: `true`)
- **`jagInsights.pollIntervalMs`**: 사용량 정보 갱신 폴링 주기 (밀리초 단위, 기본값: `30000` = 30초)
- **`jagInsights.freshnessThresholdMs`**: 데이터를 오래된 것으로 표시하는 기준 (기본값: `120000`). 실제 기준은 폴링 주기의 3배보다 짧아지지 않습니다.
- **`jagInsights.showUserEmail`**: 툴팁 및 상세창에 계정 이메일을 보여줄지 여부 (기본값: `true`)
- **`jagInsights.showPromptCredits`**: 툴팁 및 상세창에 총 프롬프트 크레딧 한도를 보여줄지 여부 (기본값: `true`)
- **`jagInsights.showQuotaOnStatusBar`**: 상태 표시줄 텍스트에 통합 쿼터 퍼센트를 노출할지 여부 (기본값: `true`)
- **`jagInsights.statusBarFormat`**: 상태 표시줄 템플릿 (기본값: `$(hubot) AG(Gemini {ag}, Codex {agcx}, Claude {agcc}) | Codex:{cx} | Claude Code:{cc}`)
  - `{ag}`: Antigravity Gemini, `{agcx}`: Antigravity Codex, `{agcc}`/`{agcl}`/`{cl}`: Antigravity Claude
  - `{cx}`: 로컬 Codex CLI (퍼센트 단위)
  - `{cc}`: 로컬 Claude Code CLI (쿼터 정보가 없으면 지난 7일간 누적 토큰 사용량을 `1.5M(7d)`처럼 표시하고, 정상 탐지됐지만 최근 사용이 없으면 `0(7d)`로 표시)
  - `{ag}`·`{agcx}`·`{agcc}`·`{agcl}`·`{cl}`은 **잔여량**, `{cx}`·`{cc}`는 **사용량**입니다.
  - 창이 여러 개인 공급자는 **가장 먼저 소진될 창**을 대표값으로 씨습니다. 표시 방향과 무관하게 같은 창이 선택됩니다.
  - 배경색은 방향과 무관하게 사용량 기준입니다. 60% 이상 주황색, 99.9% 이상 빨간색이 해당 항목에만 적용됩니다.
- **`jagInsights.codexSessionPath`**: Codex 세션 JSONL 디렉터리. 비워두면 `$CODEX_HOME/sessions` 또는 `~/.codex/sessions`를 자동 탐지합니다.
- **`jagInsights.codexUseAppServer`**: 공식 Codex app-server의 `account/rateLimits/read`를 선택적으로 사용합니다 (기본값: `false`). 실패하면 로컬 세션으로 돌아갑니다.
- **`jagInsights.codexAppServerCommand`**: 선택적 app-server에 사용할 Codex 실행 파일 (기본값: `codex`).
- **`jagInsights.claudeCodeUsagePath`**: Claude Code status-line 캡처 파일 (기본값: `~/.claude/jag-insights-usage.json`)
- **`jagInsights.claudeCodeStatePath`**: Claude Code 레거시 모니터 상태 파일 경로 (선택 사항).
- **`jagInsights.geminiSessionPath`**: Gemini CLI 세션 루트. 비우면 최신 `~/.gemini/tmp/<project>/chats`와 레거시 `~/.gemini/sessions`를 함께 탐지합니다.
- **`jagInsights.geminiTelemetryPath`**: 로컬 Gemini CLI OpenTelemetry 로그 경로 (선택 사항). Gemini 설정에서 `target: "local"`, `logPrompts: false` 사용을 권장합니다.

Claude Code의 `~/.claude.json` 사용률 캐시에서 5시간·7일 한도를 자동으로 읽습니다. 해당 캐시를 사용할 수 없다면 명령 팔레트에서 **`JAG Insights: Install Claude Code Usage Capture`**를 한 번 실행한 뒤 Claude Code에 메시지를 하나 보내세요. Claude Code가 전달하는 한도 필드만 별도 캐시에 저장하며 대화 내용과 인증정보는 저장하지 않습니다.

한도 데이터가 아직 없더라도 `CLAUDE_CONFIG_DIR`, `~/.claude/projects/`, `~/.config/claude/projects/`, Xcode Claude 연동 디렉터리의 JSONL에서 최근 24시간·7일 토큰 활동을 집계해 툴팁과 상세 메뉴에 표시합니다. 스트리밍 중 중복 기록되는 응답은 `message.id`별 마지막 값만 반영합니다. 이 방식은 MIT 라이선스의 [Claude Code Usage Dashboard](https://github.com/phuryn/claude-usage)를 참고했습니다.

Codex 사용량 수집 방식은 MIT 라이선스의 [Codex Rate Limit Monitor](https://github.com/xiangz19/codex-ratelimit-vscode) 구현을 참고했습니다.

비용은 API 가격을 사용한 참고 추정치이며 구독 청구액이 아닙니다. 가격을 알 수 없는 모델은 임의의 기본 가격을 적용하지 않고 `Unpriced`로 표시합니다.

### 🪵 문제 해결 및 트러블슈팅 (Troubleshooting)

#### Q1. 상태 표시줄에 `LS not found` 혹은 `Fetch failed`가 표시됩니다.
- **원인**: IDE가 방금 켜졌거나 백그라운드에서 안티그래비티 로컬 언어 서버(`language_server_macos_arm`) 프로세스가 아직 준비되지 않았을 때 발생합니다.
- **해결**: 약 10~20초 뒤 언어 서버가 활성화되면 다음 폴링 주기에서 자동으로 정상 복구됩니다. 또는 상태 표시줄을 클릭하여 `Refresh Quota`를 실행하거나 `F1` 키 ➡️ `Developer: Reload Window`를 실행해 보세요.

#### Q2. `Claude Code:N/A`와 `Claude Code:0(7d)`는 어떻게 다른가요?
- **`N/A`**: Claude Code 데이터 디렉터리나 공식 쿼터·로컬 활동 정보를 탐지할 수 없는 상태입니다.
- **`0(7d)`**: Claude Code 데이터 디렉터리는 정상적으로 읽었지만 최근 7일간 기록된 사용량이 없는 상태입니다.

#### Q3. 툴팁에 표시되는 포트 갱신 주기를 바꾸고 싶습니다.
- **해결**: IDE 설정(`Cmd+,`)에서 `jagInsights.pollIntervalMs` 값을 변경하면, 익스텐션이 설정 변경을 실시간으로 감지하여 폴링 주기를 즉시 조정합니다.

---

## English Guide

A lightweight extension for **both Antigravity IDE and Microsoft Visual Studio Code** that displays AI quotas and activity in real time on the IDE status bar.

By default it communicates with the local language server (Connect-RPC) and reads Codex session files, so it works without external cloud requests or CLI (`agy`) calls and requires no runtime dependencies. Network access through Codex is possible only when the optional app-server mode is enabled.

macOS and Windows are supported. Home-directory paths are resolved for the current platform, Windows process discovery uses PowerShell and `netstat.exe`, and runtime logs/state are stored in the IDE workspace storage rather than the extension installation directory.

Claude Code, Codex, and Gemini CLI usage works in both IDEs. Antigravity-specific AG model quotas appear when the Antigravity Language Server is running; in standard VS Code without that server, only the AG fields display `N/A`.

Starting with version 1.3, provider freshness is visible in the status bar and tooltip, JSONL files are parsed incrementally, and current project-scoped Gemini CLI JSON/JSONL sessions are detected automatically.

### 🌟 Key Features

1. **Real-time Status Bar Integration**
   - Displays as `🤖 AG(Gemini 27%, Codex 69%, Claude 69%) | Codex:9% | Claude Code:93%` in the bottom-right status bar of the IDE.
   - **Each segment follows the direction its own tool uses.** `AG(...)` is **remaining** quota, as the Antigravity UI shows it, while `Codex:` and `Claude Code:` are **usage**, as `/usage` shows it. The tooltip and the group headings state the direction.
   - The `AG(...)` group is **Antigravity IDE's own model quota**; the `Codex:` and `Claude Code:` segments after it are the **standalone CLIs' own quotas**. They are different numbers.
   - Separate status bar items allow each provider to independently show its normal, warning, or exhausted background color.
2. **Markdown Tooltip Grouped by Provider (Mouse Hover)**
   - Hovering over the status bar item pops up a clean Markdown tooltip.
   - Displays the user account email and prompt credit usage as a percentage.
   - Uses the same provider hierarchy and order as the status bar: **AG (Gemini/Codex/Claude) → Codex → Claude Code**.
     - **AG · Gemini**: Antigravity Gemini
     - **AG · Codex**: Antigravity Codex
     - **AG · Claude**: Antigravity Claude
     - **Codex**: Local Codex CLI
     - **Claude Code**: Local Claude Code CLI
   - Provides progress bars (`█████░░░░░ 50%`) and reset schedules for each model.
   - Inside the tooltip, links like `[ REFRESH ]` or `[ CONFIG ]` allow instant actions.
3. **Detail Panel & Quick Actions (Click)**
   - Clicking the status bar item opens a clean **QuickPick** menu at the top of the IDE.
   - Allows checking detailed reset times for each model, triggering immediate quota refreshes, or opening settings.

### ⚙️ Configuration

You can customize the settings by searching for `jagInsights` in the IDE `Settings` (`Cmd+,` or `Ctrl+,`):

- **`jagInsights.enabled`**: Enable or disable the status bar item. (Default: `true`)
- **`jagInsights.pollIntervalMs`**: Polling interval in milliseconds to fetch quota information. (Default: `30000` = 30s)
- **`jagInsights.freshnessThresholdMs`**: Age at which data is marked stale. (Default: `120000`; never shorter than three polling intervals.)
- **`jagInsights.showUserEmail`**: Display the user email in the tooltip and detail panel. (Default: `true`)
- **`jagInsights.showPromptCredits`**: Display total prompt credits in the tooltip and detail panel. (Default: `true`)
- **`jagInsights.showQuotaOnStatusBar`**: Show integrated quota percentages directly on the status bar text. (Default: `true`)
- **`jagInsights.statusBarFormat`**: Status bar template. (Default: `$(hubot) AG(Gemini {ag}, Codex {agcx}, Claude {agcc}) | Codex:{cx} | Claude Code:{cc}`)
  - Use `|` to separate the provider sections so each section can receive its own status color.
  - `{ag}`: Antigravity Gemini, `{agcx}`: Antigravity Codex, `{agcc}`/`{agcl}`/`{cl}`: Antigravity Claude
  - `{cx}`: Local Codex CLI (percentage)
  - `{cc}`: Local Claude Code CLI (displays quota percentage, falls back to a 7-day token count such as `1.5M(7d)`, or shows `0(7d)` when discovery succeeds without recent activity)
  - `{ag}`, `{agcx}`, `{agcc}`, `{agcl}` and `{cl}` are **remaining**; `{cx}` and `{cc}` are **usage**.
  - A provider with several windows is represented by the window that will exhaust first. The same window is picked in either direction.
  - Background colors are driven by usage regardless of direction: a warning at 60% used and an error at 99.9% used, applied only to the affected item.
- **`jagInsights.codexSessionPath`**: Optional Codex session directory. When empty, `$CODEX_HOME/sessions` or `~/.codex/sessions` is detected automatically.
- **`jagInsights.codexUseAppServer`**: Optionally query the documented Codex app-server `account/rateLimits/read` method. (Default: `false`; local sessions remain the fallback.)
- **`jagInsights.codexAppServerCommand`**: Codex executable for the optional app-server integration. (Default: `codex`.)
- **`jagInsights.claudeCodeUsagePath`**: Claude Code status-line capture file. (Default: `~/.claude/jag-insights-usage.json`)
- **`jagInsights.claudeCodeStatePath`**: Optional legacy Claude Code monitor state file.
- **`jagInsights.geminiSessionPath`**: Optional Gemini session root. Empty detects current `~/.gemini/tmp/<project>/chats` and legacy `~/.gemini/sessions` data.
- **`jagInsights.geminiTelemetryPath`**: Optional local Gemini CLI OpenTelemetry log. Use `target: "local"` and `logPrompts: false` in Gemini CLI.

JAG Insights automatically reads the 5-hour and 7-day limits from Claude Code's `~/.claude.json` usage cache. If that cache is unavailable, run **`JAG Insights: Install Claude Code Usage Capture`** once from the command palette, then send one Claude Code message. Only limit fields are stored in the separate cache; conversation content and credentials are never stored.

When Claude Code rate-limit data is unavailable, the status bar can fall back to a compact 7-day token count collected from `CLAUDE_CONFIG_DIR`, `~/.claude/projects/`, `~/.config/claude/projects/`, and the Xcode Claude integration directory. `Claude Code:N/A` means no usable source was found, while `Claude Code:0(7d)` means discovery succeeded without recent activity. Streamed duplicates are deduplicated by `message.id`, keeping the final record. This approach is based on the MIT-licensed [Claude Code Usage Dashboard](https://github.com/phuryn/claude-usage).

The Codex usage reader is based on the approach used by the MIT-licensed [Codex Rate Limit Monitor](https://github.com/xiangz19/codex-ratelimit-vscode).

Costs are API-equivalent estimates, not subscription billing. Unknown model prices are shown as `Unpriced` instead of being assigned a fabricated fallback rate.

### 🪵 Troubleshooting

#### Q1. The status bar displays `LS not found` or `Fetch failed`.
- **Cause**: Occurs when the IDE has just started or the background Antigravity local language server (`language_server_macos_arm`) process is not ready yet.
- **Solution**: It will automatically recover in the next polling cycle (within 10-20 seconds) once the language server activates. You can also click the status bar and select `Refresh Quota`, or run `F1` ➡️ `Developer: Reload Window`.

#### Q2. What is the difference between `Claude Code:N/A` and `Claude Code:0(7d)`?
- **`N/A`**: No usable Claude Code quota or local activity source could be found.
- **`0(7d)`**: Claude Code data was discovered successfully, but no usage was recorded in the last seven days.

#### Q3. I want to change the update interval of the status bar.
- **Solution**: Modify the `jagInsights.pollIntervalMs` value in the IDE Settings (`Cmd+,`). The extension will detect the change in real-time and adjust the polling interval instantly.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
