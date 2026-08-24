# JAG Insights - Status Bar Quota Monitor Extension

[한국어 가이드](#한국어-가이드) | [English Guide](#english-guide)

---

## 한국어 가이드

**안티그래비티 IDE와 Microsoft Visual Studio Code를 모두 지원**하며, IDE의 작업표시줄(상태 표시줄, Status Bar)에 AI 사용 한도와 활동 정보를 실시간으로 표시하는 경량 확장 프로그램(Extension)입니다.

로컬에서 구동되는 언어 서버(Language Server)와 직접 통신(Connect-RPC)하고 Codex 세션 파일을 읽어 정보를 받아오므로, 외부 클라우드 통신이나 CLI(`agy`) 호출 없이 매우 빠르게 동작하며 의존 라이브러리가 필요하지 않습니다.

macOS와 Windows를 지원합니다. 사용자 홈 경로는 운영체제에 맞게 자동 해석하며, Windows에서는 PowerShell과 `netstat.exe`를 사용해 Antigravity Language Server를 탐지합니다. 로그와 런타임 상태는 확장 프로그램 설치 폴더가 아닌 IDE의 워크스페이스 저장소에 기록됩니다.

Claude Code, Codex, Gemini CLI 사용량은 두 IDE에서 동일하게 동작합니다. Antigravity 전용 AG 모델 쿼터는 Antigravity Language Server가 실행 중일 때 표시되며, 일반 VS Code에서 해당 서버를 찾을 수 없으면 AG 항목만 `N/A`로 표시됩니다.

### 🌟 주요 기능

1. **실시간 상태 표시줄 연동**
   - IDE 오른쪽 하단 상태 표시줄에 `🤖 AG(AG 71%, Codex 100%, CloudCode 100%) | Codex:91% | CloudCode:64%` 형태로 노출됩니다.
2. **서비스별 그룹화된 마크다운 툴팁 (마우스 호버)**
   - 상태 표시줄에 마우스를 올리면 예쁜 마크다운 형식의 툴팁이 팝업됩니다.
   - 사용자 계정 이메일 및 프롬프트 크레딧 정보 잔량을 퍼센트로 보여줍니다.
   - AI 모델들이 아래 3개 그룹으로 묶여 표시되므로 편리합니다:
     - **Cloud Code (Google Gemini)**
     - **OpenAI Codex**
     - **Anthropic Claude**
   - 모델별 사용량 게이지 바(`█████░░░░░ 50%`)와 초기화 일정 정보를 실시간 모니터링할 수 있습니다.
   - 툴팁 내부 링크를 통해 `[ REFRESH ]` 또는 `[ CONFIG ]` 제어가 즉시 가능합니다.
3. **상세 정보 패널 및 액션 (클릭)**
   - 상태 표시줄을 클릭하면 IDE 상단에 깔끔한 **퀵픽(QuickPick)** 메뉴가 나타납니다.
   - 각 AI 모델 정보 목록 확인, 즉시 사용량 새로고침 액션 실행, 설정창 진입을 간편하게 수행할 수 있습니다.

### ⚙️ 설정 구성 (Configuration)

IDE의 `Settings` (설정창, `Cmd+,` 혹은 `Ctrl+,`)에서 `jagInsights`를 검색해 설정을 변경할 수 있습니다:

- **`jagInsights.enabled`**: 상태 표시줄에 모니터를 띄울지 여부 (기본값: `true`)
- **`jagInsights.pollIntervalMs`**: 사용량 정보 갱신 폴링 주기 (밀리초 단위, 기본값: `30000` = 30초)
- **`jagInsights.showUserEmail`**: 툴팁 및 상세창에 계정 이메일을 보여줄지 여부 (기본값: `true`)
- **`jagInsights.showPromptCredits`**: 툴팁 및 상세창에 총 프롬프트 크레딧 한도를 보여줄지 여부 (기본값: `true`)
- **`jagInsights.showQuotaOnStatusBar`**: 상태 표시줄 텍스트에 통합 쿼터 퍼센트(AG, CX, CL)를 노출할지 여부 (기본값: `true`)
- **`jagInsights.statusBarFormat`**: 상태 표시줄 템플릿 (기본값: `$(hubot) AG(AG {ag}, Codex {agcx}, CloudCode {agcc}) | Codex:{cx} | CloudCode:{cc}`)
  - `{ag}`: Antigravity Gemini, `{agcx}`: Antigravity Codex, `{agcc}`/`{agcl}`/`{cl}`: Antigravity Claude
  - `{cx}`: 로컬 Codex (퍼센트 단위)
  - `{cc}`: Claude Code (쿼터 퍼센트 노출. 단, 쿼터 제한이 없거나 정보 수집 전이면 지난 7일간 누적 토큰 사용량(예: `1.5M(7d)`)을 대신 표시)
- **`jagInsights.codexSessionPath`**: Codex 세션 JSONL 디렉터리. 비워두면 `$CODEX_HOME/sessions` 또는 `~/.codex/sessions`를 자동 탐지합니다.
- **`jagInsights.codexStatePath`**: 로컬 Codex 레거시 모니터 상태 파일 경로 (선택 사항). 세션 데이터를 가져올 수 없을 때의 백업용 파일입니다.
- **`jagInsights.claudeCodeUsagePath`**: Claude Code status-line 캡처 파일 (기본값: `~/.claude/jag-insights-usage.json`)
- **`jagInsights.claudeCodeStatePath`**: Claude Code 레거시 모니터 상태 파일 경로 (선택 사항).

Claude Code의 `~/.claude.json` 사용률 캐시에서 5시간·7일 한도를 자동으로 읽습니다. 해당 캐시를 사용할 수 없다면 명령 팔레트에서 **`JAG Insights: Install Claude Code Usage Capture`**를 한 번 실행한 뒤 Claude Code에 메시지를 하나 보내세요. Claude Code가 전달하는 한도 필드만 별도 캐시에 저장하며 대화 내용과 인증정보는 저장하지 않습니다.

한도 데이터가 아직 없더라도 `~/.claude/projects/`와 Xcode Claude 연동 디렉터리의 JSONL에서 최근 24시간·7일 토큰 활동을 집계해 툴팁과 상세 메뉴에 표시합니다. 스트리밍 중 중복 기록되는 응답은 `message.id`별 마지막 값만 반영합니다. 이 방식은 MIT 라이선스의 [Claude Code Usage Dashboard](https://github.com/phuryn/claude-usage)를 참고했습니다.

Codex 사용량 수집 방식은 MIT 라이선스의 [Codex Rate Limit Monitor](https://github.com/xiangz19/codex-ratelimit-vscode) 구현을 참고했습니다.

### 🪵 문제 해결 및 트러블슈팅 (Troubleshooting)

#### Q1. 상태 표시줄에 `LS not found` 혹은 `Fetch failed`가 표시됩니다.
- **원인**: IDE가 방금 켜졌거나 백그라운드에서 안티그래비티 로컬 언어 서버(`language_server_macos_arm`) 프로세스가 아직 준비되지 않았을 때 발생합니다.
- **해결**: 약 10~20초 뒤 언어 서버가 활성화되면 다음 폴링 주기에서 자동으로 정상 복구됩니다. 또는 상태 표시줄을 클릭하여 `Refresh Quota`를 실행하거나 `F1` 키 ➡️ `Developer: Reload Window`를 실행해 보세요.

#### Q2. 툴팁에 표시되는 포트 갱신 주기를 바꾸고 싶습니다.
- **해결**: IDE 설정(`Cmd+,`)에서 `jagInsights.pollIntervalMs` 값을 변경하면, 익스텐션이 설정 변경을 실시간으로 감지하여 폴링 주기를 즉시 조정합니다.

---

## English Guide

A lightweight extension for **both Antigravity IDE and Microsoft Visual Studio Code** that displays AI quotas and activity in real time on the IDE status bar.

It communicates with the locally running language server (Connect-RPC) and reads Codex session files, so it works without external cloud requests or CLI (`agy`) calls and requires no runtime dependencies.

macOS and Windows are supported. Home-directory paths are resolved for the current platform, Windows process discovery uses PowerShell and `netstat.exe`, and runtime logs/state are stored in the IDE workspace storage rather than the extension installation directory.

Claude Code, Codex, and Gemini CLI usage works in both IDEs. Antigravity-specific AG model quotas appear when the Antigravity Language Server is running; in standard VS Code without that server, only the AG fields display `N/A`.

### 🌟 Key Features

1. **Real-time Status Bar Integration**
   - Displays as `🤖 AG(AG 71%, Codex 100%, CloudCode 100%) | Codex:91% | CloudCode:64%` in the bottom-right status bar of the IDE.
   - Separate status bar items allow each provider to independently show its normal, warning, or exhausted background color.
2. **Markdown Tooltip Grouped by Provider (Mouse Hover)**
   - Hovering over the status bar item pops up a clean Markdown tooltip.
   - Displays the user account email and prompt credit usage as a percentage.
   - Uses the same provider hierarchy and order as the status bar: **AG (AG/Codex/CloudCode) → Codex → CloudCode**.
     - **AG · AG**: Antigravity Gemini
     - **AG · Codex**: Antigravity Codex
     - **AG · CloudCode**: Antigravity Claude
     - **Codex**: Local Codex
     - **CloudCode**: Claude Code
   - Provides progress bars (`█████░░░░░ 50%`) and reset schedules for each model.
   - Inside the tooltip, links like `[ REFRESH ]` or `[ CONFIG ]` allow instant actions.
3. **Detail Panel & Quick Actions (Click)**
   - Clicking the status bar item opens a clean **QuickPick** menu at the top of the IDE.
   - Allows checking detailed reset times for each model, triggering immediate quota refreshes, or opening settings.

### ⚙️ Configuration

You can customize the settings by searching for `jagInsights` in the IDE `Settings` (`Cmd+,` or `Ctrl+,`):

- **`jagInsights.enabled`**: Enable or disable the status bar item. (Default: `true`)
- **`jagInsights.pollIntervalMs`**: Polling interval in milliseconds to fetch quota information. (Default: `30000` = 30s)
- **`jagInsights.showUserEmail`**: Display the user email in the tooltip and detail panel. (Default: `true`)
- **`jagInsights.showPromptCredits`**: Display total prompt credits in the tooltip and detail panel. (Default: `true`)
- **`jagInsights.showQuotaOnStatusBar`**: Show integrated quota percentages directly on the status bar text. (Default: `true`)
- **`jagInsights.statusBarFormat`**: Status bar template. (Default: `$(hubot) AG(AG {ag}, Codex {agcx}, CloudCode {agcc}) | Codex:{cx} | CloudCode:{cc}`)
  - Use `|` to separate the provider sections so each section can receive its own status color.
  - `{ag}`: Antigravity Gemini, `{agcx}`: Antigravity Codex, `{agcc}`/`{agcl}`/`{cl}`: Antigravity Claude
  - `{cx}`: Local Codex (percentage)
  - `{cc}`: Claude Code (Displays quota percentage, or falls back to last 7 days token count (e.g., `1.5M(7d)`) if quota info is unavailable)
- **`jagInsights.codexSessionPath`**: Optional Codex session directory. When empty, `$CODEX_HOME/sessions` or `~/.codex/sessions` is detected automatically.
- **`jagInsights.codexStatePath`**: Optional legacy Codex monitor state file, used as a fallback only when session data is unavailable.
- **`jagInsights.claudeCodeUsagePath`**: Claude Code status-line capture file. (Default: `~/.claude/jag-insights-usage.json`)
- **`jagInsights.claudeCodeStatePath`**: Optional legacy Claude Code monitor state file.

JAG Insights automatically reads the 5-hour and 7-day limits from Claude Code's `~/.claude.json` usage cache. If that cache is unavailable, run **`JAG Insights: Install Claude Code Usage Capture`** once from the command palette, then send one Claude Code message. Only limit fields are stored in the separate cache; conversation content and credentials are never stored.

When Claude Code rate-limit data is unavailable, the status bar can fall back to a compact 7-day token count collected from `~/.claude/projects/` and the Xcode Claude integration directory. This activity is not shown as a separate tooltip or details section. Streamed duplicates are deduplicated by `message.id`, keeping the final record. This approach is based on the MIT-licensed [Claude Code Usage Dashboard](https://github.com/phuryn/claude-usage).

The Codex usage reader is based on the approach used by the MIT-licensed [Codex Rate Limit Monitor](https://github.com/xiangz19/codex-ratelimit-vscode).

### 🪵 Troubleshooting

#### Q1. The status bar displays `LS not found` or `Fetch failed`.
- **Cause**: Occurs when the IDE has just started or the background Antigravity local language server (`language_server_macos_arm`) process is not ready yet.
- **Solution**: It will automatically recover in the next polling cycle (within 10-20 seconds) once the language server activates. You can also click the status bar and select `Refresh Quota`, or run `F1` ➡️ `Developer: Reload Window`.

#### Q2. I want to change the update interval of the status bar.
- **Solution**: Modify the `jagInsights.pollIntervalMs` value in the IDE Settings (`Cmd+,`). The extension will detect the change in real-time and adjust the polling interval instantly.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
