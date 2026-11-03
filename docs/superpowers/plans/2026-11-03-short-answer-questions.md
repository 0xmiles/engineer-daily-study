# 단답형 문제 구현 계획

**목표:** [설계 문서](../specs/2026-11-03-short-answer-questions-design.md)의 단답형 문제를 구현한다.

**구조:** `format` 값 `short-answer` 를 추가하고, 차이는 `isShortAnswer` 분기로 총점 계산, 문제 저장, 일일 구성, 화면에만 둔다.

## 작업

- [ ] **1. 분류 체계와 타입:** `schemas/taxonomy.json`, `schemas/question-content.schema.json`, `src/shared/types.ts`, `src/shared/rules.ts`, `src/shared/taxonomy.ts`
- [ ] **2. 총점 계산:** `src/main/domain/scoring.ts` 와 테스트. 판정별 100, 50, 0점이고 관점 점수와 감점은 무시한다.
- [ ] **3. 일일 구성:** `src/main/domain/selection.ts` 와 테스트, `daily.test.ts`, `topics.test.ts` 갱신. 3문제 추가, 같은 문제 중복 금지, 약점 복습 제외.
- [ ] **4. 문제 저장 규칙:** `src/main/services/questionAuthoring.ts` 와 테스트. 저장 전에 단답형 구조로 맞춘다.
- [ ] **5. 출제와 채점 skill:** `skills/` 문서에 단답형 규칙을 추가한다.
- [ ] **6. 시드 문제와 검증:** 21문제 추가, `scripts/validate-seed.mjs` 에 단답형 규칙 추가.
- [ ] **7. 화면:** 풀이, 결과, 문제 설명, 오늘, 설정, 직접 입력 화면.
- [ ] **8. 문서:** `README.md`, `docs/plan.md`.
- [ ] **9. 검증과 머지:** 브랜치를 푸시하고 `gh workflow run build.yml --ref feature/short-answer-questions` 로 타입 검사, 테스트, 시드 검증, 설치 파일 빌드를 확인한 뒤 `main` 에 머지한다.
