# Daily Study

백엔드 개발자가 매일 실무 시나리오형·CS 개념형 서술형 문제를 풀고, LLM 감독관에게 채점과 학습 피드백을 받는 데스크톱 앱입니다(macOS, Windows).

- 매일 시나리오형 1문제와 개념형 1문제(설정에 따라 3문제), 점수가 낮았던 주제의 약점 복습 문제를 출제합니다.
- 제출하면 점수, 관점별 점수, 잘한 점, 부족한 점, 모범 답안, 추가 학습 주제를 보여 줍니다.
- 원하는 형식·유형·주제·난이도로 추가 문제를 풀 수 있고, 한 번 출제된 문제는 다시 나오지 않습니다.
- 문제와 출제 방식에 남긴 피드백은 이후 문제 생성에 반영됩니다.
- 출제·채점 규칙은 `skills/` 의 skill 파일 두 개가 원본이며, 앱과 Claude Code·Codex 터미널이 같은 규칙을 씁니다.

## 문서

- [설치 가이드](docs/install.md)
- [기획서](docs/plan.md)

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `skills/` | 출제(`daily-study-question-author`)·채점(`daily-study-grader`) skill |
| `schemas/` | LLM 출력 JSON Schema, 분류 체계(`taxonomy.json`) |
| `seed/questions/` | 초기 문제 은행 56문제 |
| `src/main/` | Electron 메인 프로세스: 저장, 출제, 채점, LLM 실행 |
| `src/renderer/` | 화면(React) |
| `scripts/` | 설치(`setup.mjs`), 문제 은행 검증(`validate-seed.mjs`) |

## 개발 명령

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 모드 실행 |
| `npm test` | 단위 테스트 |
| `npm run typecheck` | 타입 검사 |
| `npm run validate:seed` | 초기 문제 은행 형식·중복 검사 |
| `npm run dist:mac` / `npm run dist:win` | 설치 파일 빌드 |
