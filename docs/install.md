# Folio 설치 가이드

macOS와 Windows에서 Folio를 설치하고 실행하는 방법입니다.

## 1. 준비물

| 항목 | 설명 |
|---|---|
| Node.js 22.12 이상 | https://nodejs.org 에서 LTS 버전을 설치합니다. `node -v` 로 확인합니다. 테스트 도구(vitest 5)가 22.12 이상을 요구합니다. |
| Git | 저장소를 내려받을 때 필요합니다. 폴더를 직접 복사한다면 없어도 됩니다. |
| LLM 실행기 (둘 중 하나 이상) | **Claude Code**: `npm install -g @anthropic-ai/claude-code` 후 `claude` 를 한 번 실행해 로그인합니다.<br>**Codex**: `npm install -g @openai/codex` 후 `codex login` 으로 로그인합니다. |

앱은 문제 생성과 채점을 위해 이 CLI를 백그라운드에서 실행합니다(`claude -p`, `codex exec`). 따라서 CLI를 쓸 수 있는 계정과 사용량이 필요합니다.

## 2. 공통 설치 단계

```bash
git clone <저장소 주소> daily-study
cd daily-study
npm ci
npm run setup
```

### 회사 네트워크에서 설치하기

`registry.npmjs.org` 가 차단된 네트워크에서는 사내 npm 미러(Nexus, Artifactory 등)를 지정해 설치합니다. 미러 주소는 사내 개발 환경 안내를 참고하세요.

```bash
npm ci --registry=<사내 npm 미러 주소>
```

- `package-lock.json` 에는 공개 레지스트리 주소가 적혀 있습니다. npm 은 `--registry` 로 지정한 미러에서 같은 파일을 받고, lockfile 의 무결성 해시로 내용을 검증합니다.
- Electron 실행 파일은 `npm run dev` 를 처음 실행할 때 GitHub에서 받습니다. 미리 받으려면 `node node_modules/electron/install.js` 를 실행합니다.
- 미러에 아직 없는 최신 버전이 필요하면 설치가 404로 실패합니다. 이 경우 `package.json` 의 `overrides` 로 미러에 있는 버전을 고정합니다. 현재는 `node-gyp` 가 쓰는 `undici` 를 6.29.0으로 고정했습니다. 이 앱에는 네이티브 모듈이 없어서 `node-gyp` 가 실행되지 않습니다. 미러에 6.29.1 이상이 올라오면 이 고정을 지웁니다.

`npm run setup` 은 다음을 수행합니다.

1. Node.js 버전을 확인합니다.
2. 출제·채점·면접·학습 노트 skill 네 개(`skills/daily-study-question-author`, `skills/daily-study-grader`, `skills/daily-study-interviewer`, `skills/daily-study-tutor`)를 Claude Code(`~/.claude/skills`)와 Codex(`~/.codex/skills`)의 사용자 skill 위치에 연결합니다. 그래서 앱 없이 터미널에서 "Daily Study 규칙으로 Kafka 시니어 시나리오 문제 하나 만들어 줘"라고 요청해도 같은 규칙으로 문제가 만들어집니다.
3. `claude`, `codex` 명령을 찾을 수 있는지 확인합니다.

설치 없이 바로 실행해 보려면 다음 명령을 실행합니다.

```bash
npm run dev
```

## 3. macOS 앱으로 설치

```bash
npm run dist:mac
```

1. `release/` 폴더에 만들어진 `.dmg` 파일을 엽니다.
2. `Folio` 를 응용 프로그램 폴더로 끌어 옮깁니다.
3. 이전 이름(`Daily Study`)으로 설치한 앱이 있다면 지워도 됩니다. 설정과 풀이 기록은 Folio에서 그대로 이어집니다.
4. 서명하지 않은 앱이라 처음 실행하면 "확인되지 않은 개발자" 경고가 나옵니다. **시스템 설정 → 개인정보 보호 및 보안** 아래쪽의 "그래도 열기"를 누릅니다.

## 4. Windows 앱으로 설치

PowerShell에서 실행합니다.

```powershell
npm run dist:win
```

1. `release\` 폴더에 만들어진 설치 파일(`Folio Setup x.y.z.exe`)을 실행합니다.
2. 서명하지 않은 앱이라 SmartScreen 경고가 나오면 **추가 정보 → 실행**을 누릅니다.

### Windows에서 자주 겪는 문제

| 증상 | 해결 |
|---|---|
| `npm` 실행 시 "이 시스템에서 스크립트를 실행할 수 없으므로" 오류 | PowerShell에서 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 를 실행합니다. |
| 앱 설정 화면에 "Claude Code: 찾을 수 없음" | 터미널에서 `where claude` 로 경로를 찾아 설정 화면의 "Claude Code 실행 파일 경로"에 붙여 넣습니다. |
| Codex 실행이 실패함 | Codex CLI는 Windows 네이티브 지원이 실험적일 수 있습니다. 실행이 안 되면 설정에서 실행기를 Claude Code로 바꿉니다. |

## 5. 처음 실행한 뒤 확인할 것

1. 왼쪽 메뉴에서 **설정**을 엽니다.
2. **LLM 실행기**를 고르고 저장합니다.
3. **연결 테스트**를 누릅니다. "연결되었습니다"가 나오면 출제와 채점을 쓸 수 있습니다.
4. **오늘의 문제**로 돌아가 문제를 풉니다.

## 6. 데이터 위치

문제, 풀이 기록, 피드백은 JSON 파일로 저장됩니다.

| OS | 기본 위치 |
|---|---|
| macOS | `~/Documents/DailyStudy` |
| Windows | `%USERPROFILE%\Documents\DailyStudy` |

설정 화면에서 위치를 바꿀 수 있습니다. 이 폴더를 백업하거나 git으로 관리하면 기록을 옮길 수 있습니다.

## 7. 빌드 없이 설치 파일 받기

`main` 브랜치에 푸시하면 `.github/workflows/build.yml` 이 macOS와 Windows 설치 파일을 각각 만들고, 두 파일을 담은 GitHub 릴리스를 새로 만듭니다.
저장소의 **Releases** 에서 가장 최근 릴리스(`v<버전>-build.<실행 번호>`)를 열어 `.dmg` 또는 `.exe` 를 내려받습니다.
