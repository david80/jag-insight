# JAG Insights - 개발자 가이드 (Developer Guide)

본 문서는 **JAG Insights** 익스텐션 개발자들을 위한 로컬 빌드, 디버깅 및 배포용 패키징 가이드입니다.

---

## 🚀 로컬 테스트 및 디버그 방법

현재 소스 코드를 Antigravity IDE 또는 Visual Studio Code에 로드하여 실시간으로 확인하고 테스트하는 방법입니다:

1. **워크스페이스 열기**
   - 이 익스텐션 소스 폴더를 Antigravity IDE 또는 Visual Studio Code로 엽니다.
2. **의존성 설치**
   - 개발 시 자동완성 및 VS Code API 타입 지원을 위해 최초 1회 개발 의존성을 설치합니다:
     ```bash
     npm install
     ```
3. **디버깅 모드 가동 (`F5`)**
   - IDE 화면에서 키보드의 **`F5`** 키를 누릅니다 (혹은 좌측 디버그 탭에서 `Run Extension` 실행).
   - 자동으로 확장 프로그램이 빌드 및 활성화된 **[Extension Development Host]** 임시 IDE 창이 새로 뜹니다.
4. **동작 검증**
   - 새로 뜬 개발 호스트 IDE 창의 우측 하단 상태 표시줄에 통합 쿼터 정보가 정상 표시되는지 확인합니다.
   - 마우스를 호버하여 쿼터 테이블을 관찰하거나, 클릭하여 퀵픽 메뉴가 열리는지 테스트합니다.

---

## 📦 배포용 VSIX 빌드 및 패키징 방법 (Build & Package)

다른 개발자들에게 공유하거나 실제 IDE에 적용할 `.vsix` 배포 파일을 패키징하는 상세 방법입니다.

### 1. 사전 준비 (Prerequisites)

- 개발 환경에 **Node.js**가 설치되어 있어야 합니다.
- 최초 1회, 터미널에서 `npm install` 명령어를 실행하여 개발 의존성 패키지를 로드해 둡니다.

### 2. 패키징 실행 (VSIX 파일 생성)

1. 새로운 패키지를 만들거나 버전을 올릴 경우, 'package.json'의 `"version"` 항목(예: `"1.1.0"`)을 원하는 버전으로 수정합니다.
2. 터미널에서 프로젝트 루트 경로로 이동한 뒤 아래 명령어를 실행합니다:
   ```bash
   npm run package
   ```
3. **자동화 스크립트(`scripts/build.js`) 동작 프로세스**:
   - `package.json`에 기재된 버전을 감지합니다.
   - 프로젝트 루트 아래에 `releases/${version}/` 폴더를 자동으로 생성합니다 (예: `releases/1.1.0/`).
   - `vsce` 패키징 모듈을 실행하여 해당 폴더 내부에 `jag-insight-${version}.vsix` 파일을 빌드 및 출력합니다.

### 3. 패키지 제외 대상 관리 (`.vscodeignore`)

- 배포 파일의 용량 최소화와 보안을 위해, 개발자용 문서(`DEVELOPER.md`), 자동 빌드 스크립트(`scripts/`), 개발용 로그(`daemon.log`), 캐시 파일(`last_status.json`) 등은 `.vscodeignore` 설정을 통해 빌드 시 `.vsix` 패키지 구성에서 자동으로 제외됩니다.

### 4. 생성된 VSIX 파일 설치 및 검증

빌드가 완료된 배포 파일은 아래 두 가지 방법 중 하나를 선택해 IDE에 설치하고 기능을 수동 검증할 수 있습니다:

- **방법 A (터미널)**:
  ```bash
  code --install-extension releases/1.2.8/jag-insight-1.2.8.vsix
  ```
- **방법 B (IDE GUI)**:
  - Antigravity IDE 또는 Visual Studio Code의 **확장(Extensions) 탭**을 엽니다.
  - 검색창 우측 상단의 **더보기 `...` 버튼**을 누르고 **`Install from VSIX...`**를 클릭합니다.
  - 생성된 `releases/1.2.6/jag-insight-1.2.6.vsix` 파일을 선택해 설치를 완료합니다.
