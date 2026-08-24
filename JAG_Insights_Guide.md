# 🤖 JAG Insights — Installation & Usage Guide
**Antigravity IDE · VS Code AI Usage Monitor**

> 🇺🇸 [English](#english) | 🇰🇷 [한국어](#한국어)

---

<a name="english"></a>
# 🇺🇸 English

**JAG Insights** supports both **Antigravity IDE and Microsoft Visual Studio Code**. It is an extension that visualizes AI usage limits and remaining quota in real time directly in the status bar.

Claude Code, Codex, and Gemini CLI information are available in both IDEs. Antigravity-exclusive model quotas are provided when the Antigravity Language Server is running.

Installation is simple — just use the single `.vsix` file provided.

---

## 💾 1. Installation (VSIX)

Choose whichever method is more convenient.

### Method A: Install via GUI (Recommended)
1. Launch **Antigravity IDE or Visual Studio Code**.
2. Open the **Extensions tab** in the left sidebar (`Cmd+Shift+X` or `Ctrl+Shift+X`).
3. Click the **`...` (More Actions) button** at the top-right of the Extensions search bar.
4. Select **`Install from VSIX...`** from the dropdown.
5. Choose the provided **`jag-insight-1.2.8.vsix`** file and complete the installation.
6. Once installed, the monitor will load immediately in the bottom-right status bar — no IDE restart required.

### Method B: Install via Terminal
Open a terminal, navigate to the directory containing the VSIX file, and run:
```bash
# Use the launcher command matching your IDE (e.g., code, cursor, etc.)
code --install-extension jag-insight-1.2.8.vsix
```

---

## 🌟 2. Features & Usage

### 1. Real-Time Monitoring (Status Bar)
After successful installation, the `🤖 JAG Insights` item will reside permanently in the bottom-right status bar of Antigravity IDE or VS Code.

### 2. Detailed Usage View (Hover)
Hover over the `🤖 JAG Insights` status bar item to reveal a rich Markdown popup:
* **User account info** and **total prompt credit usage**
* **Per-service AI model usage gauge bars** with reset time info (grouped by Cloud Code/Google Gemini, OpenAI Codex, and Anthropic Claude)
* When remaining quota drops to 40% or below, a red warning indicator activates automatically.
* Click the `[ REFRESH ]` and `[ CONFIG ]` links at the bottom of the tooltip for instant manual refresh or settings navigation.

### 3. Quick Action Menu (Left Click)
Click the status bar item to open the **QuickPick popup menu** at the top of the screen:
* Lists the reset countdown for each AI model, organized by service group (Cloud Code, Codex, Claude).
* Press **`Refresh Quota`** at the bottom of the menu to manually refresh usage data, or **`Settings`** to jump directly to extension settings.

---

## ⚙️ 3. Configuration

Open the IDE settings (`Cmd+,` or `Ctrl+,`) and search for **`jagInsights`** to customize options:

* **`jagInsights.enabled`**: Show/hide the status bar monitor (default: `true`)
* **`jagInsights.pollIntervalMs`**: Background refresh interval in milliseconds (default: `30000` = 30 s)
* **`jagInsights.showUserEmail`**: Show email address in the tooltip (default: `true`)
* **`jagInsights.showPromptCredits`**: Show total credit balance in the tooltip (default: `true`)
* **`jagInsights.showQuotaOnStatusBar`**: Show integrated quota percentages (AG, CX, CL) in the status bar text (default: `true`)
* **`jagInsights.statusBarFormat`**: Status bar template (default: `$(hubot) AG(AG {ag}, Codex {agcx}, CloudCode {agcc}) | Codex:{cx} | CloudCode:{cc}`)
  * `{ag}`: Antigravity Gemini, `{agcx}`: Antigravity Codex, `{agcc}`/`{agcl}`/`{cl}`: Antigravity Claude
  * `{cx}`: Local Codex (percentage)
  * `{cc}`: Claude Code quota percentage. If no quota limit exists or data has not yet been collected, shows the cumulative 7-day token usage instead (e.g., `1.5M(7d)`)
* **`jagInsights.codexSessionPath`**: Codex session JSONL directory. Leave blank to auto-detect `$CODEX_HOME/sessions` or `~/.codex/sessions`
* **`jagInsights.codexStatePath`**: Local Codex legacy monitor state file path (optional). Used as a fallback when session data is unavailable.
* **`jagInsights.claudeCodeUsagePath`**: Claude Code status-line capture file (default: `~/.claude/jag-insights-usage.json`)
* **`jagInsights.claudeCodeStatePath`**: Claude Code legacy monitor state file path (optional).

To enable Claude Code usage tracking, run **`JAG Insights: Install Claude Code Usage Capture`** from the Command Palette, then send one message in Claude Code.

---
---

<a name="한국어"></a>
# 🇰🇷 한국어

**JAG Insights**는 **Antigravity IDE와 Microsoft Visual Studio Code를 모두 지원**하며, 상태 표시줄에 AI 사용량 한도 및 잔량 정보를 실시간 시각화하는 확장 프로그램(Extension)입니다.

Claude Code, Codex, Gemini CLI 정보는 두 IDE에서 사용할 수 있습니다. Antigravity 전용 모델 쿼터는 Antigravity Language Server가 실행 중일 때 제공됩니다.

제공되는 `.vsix` 파일 하나로 간편하게 설치하여 사용하실 수 있습니다.

---

## 💾 1. 설치 방법 (VSIX 파일 설치)

아래 두 가지 방법 중 편한 방법으로 설치해 주세요.

### 방법 A: 마우스 클릭으로 설치 (권장)
1. **Antigravity IDE 또는 Visual Studio Code**를 실행합니다.
2. 왼쪽 사이드바에서 **확장(Extensions) 탭** (단축키: `Cmd+Shift+X` 또는 `Ctrl+Shift+X`)을 클릭합니다.
3. 확장 탭 검색창 우측 상단에 있는 **`...` (더보기) 버튼**을 클릭합니다.
4. 드롭다운 메뉴에서 **`Install from VSIX...`**를 선택합니다.
5. 전달받은 **`jag-insight-1.2.8.vsix`** 파일을 선택하고 설치(Install)를 완료합니다.
6. 설치가 완료되면 IDE를 재시작하지 않아도 우측 하단 상태 표시줄에 바로 모니터가 로드됩니다.

### 방법 B: 터미널 명령어로 즉시 설치
터미널을 열고 VSIX 파일이 있는 경로로 이동하여 아래 명령어를 실행합니다:
```bash
# 사용 중인 IDE 런처 명령어에 맞춰 실행해 주세요 (예: code, cursor 등)
code --install-extension jag-insight-1.2.8.vsix
```

---

## 🌟 2. 주요 기능 및 사용법

### 1. 실시간 모니터링 (상태 표시줄)
설치가 성공하면 Antigravity IDE 또는 VS Code 화면 우측 하단 상태 표시줄에 `🤖 JAG Insights` 아이템이 상주합니다.

### 2. 사용량 상세 조회 (마우스 호버)
상태 표시줄의 `🤖 JAG Insights` 영역에 마우스를 가져다 대면(Hover) 예쁜 마크다운 팝업창이 나타납니다.
* **사용자 계정 정보** 및 **전체 프롬프트 크레딧 사용량**
* **서비스별 AI 모델들의 사용량 게이지 바** 및 초기화 시간 정보 제공 (Cloud Code/Google Gemini, OpenAI Codex, Anthropic Claude 서비스별로 그룹화되어 개별 표기됨)
* 잔량이 40% 이하로 떨어지면 자동으로 빨간색(경고) 인디케이터가 활성화됩니다.
* 툴팁 하단에 제공되는 `[ REFRESH ]`와 `[ CONFIG ]` 링크를 클릭해 즉각적으로 수동 새로고침 및 환경설정 이동이 가능합니다.

### 3. 간편 액션 메뉴 (마우스 좌클릭)
상태 표시줄 영역을 클릭하면 화면 상단에 **QuickPick 팝업 메뉴**가 노출됩니다.
* 개별 AI 모델들의 리셋 남은 시간을 서비스 그룹별(Cloud Code, Codex, Claude)로 구분하여 직관적으로 나열해 줍니다.
* 메뉴 최하단의 **`Refresh Quota`**를 눌러 사용 정보를 동적으로 수동 갱신할 수 있고, **`Settings`**를 눌러 익스텐션 설정창으로 바로 이동할 수 있습니다.

---

## ⚙️ 3. 커스텀 설정 변경 방법

IDE의 설정창(단축키: `Cmd+,` 또는 `Ctrl+,`)을 켠 뒤 검색창에 **`jagInsights`**를 검색하여 개인 취향에 맞추어 옵션을 변경할 수 있습니다:

* **`jagInsights.enabled`**: 상태 표시줄에 모니터를 띄울지 여부 (기본값: `true`)
* **`jagInsights.pollIntervalMs`**: 백그라운드 갱신 주기 (밀리초 단위, 기본값: `30000` = 30초)
* **`jagInsights.showUserEmail`**: 툴팁에 이메일 주소를 보여줄지 여부 (기본값: `true`)
* **`jagInsights.showPromptCredits`**: 툴팁에 총 크레딧 잔량을 보여줄지 여부 (기본값: `true`)
* **`jagInsights.showQuotaOnStatusBar`**: 상태 표시줄 텍스트에 통합 쿼터 퍼센트(AG, CX, CL)를 노출할지 여부 (기본값: `true`)
* **`jagInsights.statusBarFormat`**: 상태 표시줄 템플릿 (기본값: `$(hubot) AG(AG {ag}, Codex {agcx}, CloudCode {agcc}) | Codex:{cx} | CloudCode:{cc}`)
  * `{ag}`: Antigravity Gemini, `{agcx}`: Antigravity Codex, `{agcc}`/`{agcl}`/`{cl}`: Antigravity Claude
  * `{cx}`: 로컬 Codex (퍼센트 단위)
  * `{cc}`: Claude Code (쿼터 퍼센트 노출. 단, 쿼터 제한이 없거나 정보 수집 전이면 지난 7일간 누적 토큰 사용량(예: `1.5M(7d)`)을 대신 표시)
* **`jagInsights.codexSessionPath`**: Codex 세션 JSONL 디렉터리. 비워두면 `$CODEX_HOME/sessions` 또는 `~/.codex/sessions` 자동 탐지
* **`jagInsights.codexStatePath`**: 로컬 Codex 레거시 모니터 상태 파일 경로 (선택 사항). 세션 데이터를 가져올 수 없을 때의 백업용 파일입니다.
* **`jagInsights.claudeCodeUsagePath`**: Claude Code status-line 캡처 파일 (기본값: `~/.claude/jag-insights-usage.json`)
* **`jagInsights.claudeCodeStatePath`**: Claude Code 레거시 모니터 상태 파일 경로 (선택 사항).

Claude Code 사용량을 활성화하려면 명령 팔레트에서 **`JAG Insights: Install Claude Code Usage Capture`**를 실행한 뒤 Claude Code에 메시지를 하나 보냅니다.
