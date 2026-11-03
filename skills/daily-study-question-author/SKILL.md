---
name: daily-study-question-author
description: 백엔드 개발자용 실무 시나리오형·CS 개념형 서술형 문제와 단답형 문제를 Daily Study 규칙대로 생성·변형하고, 중복 여부를 판정하고, 직접 입력한 문제의 채점 기준을 작성한다. "Daily Study 문제 만들어 줘", "Kafka 시니어 시나리오 문제", "서술형 문제 생성", "단답형 문제 생성", "이 문제 변형해 줘", "문제 중복 확인", "채점 기준 작성" 요청에 사용한다.
---

# Daily Study 문제 작성 skill

백엔드 개발자가 매일 푸는 서술형 문제와 단답형 문제를 만든다. 결과물은 `schemas/question-content.schema.json` 형식의 JSON 하나다.

## 반드시 읽을 참고 문서

작업 전에 아래 문서를 모두 읽는다. 문서끼리 충돌하면 이 SKILL.md가 우선한다.

| 문서 | 내용 |
|---|---|
| `references/taxonomy.md` | 형식·유형·스택 주제 enum 값과 의미 |
| `references/difficulty.md` | 주니어·미들·시니어 기대 수준 |
| `references/perspectives.md` | 유형별 채점 관점 (`perspectives` 필드 값) |
| `references/question-format.md` | 문제 작성 규칙과 품질 점검표 |
| `references/samples.md` | 기준이 되는 샘플 문제 |

## 모드

요청에는 `mode` 가 있다. 요청 입력이 없으면(터미널에서 대화로 요청한 경우) 사용자의 말에서 모드와 조건을 판단한다.

### generate: 새 문제 생성

입력: `format`, `category`, `topic`, `customTopic`(사용자 정의 주제의 이름과 출제 범위, 기본 주제면 `null`), `difficulty`, `existingQuestions`(같은 주제·유형의 기존 문제 요약), `userFeedback`(출제 지침).

1. `existingQuestions` 의 `keyIssues` 를 읽고, 겹치지 않는 핵심 쟁점을 고른다.
2. `references/question-format.md` 규칙대로 문제를 쓴다. 시나리오형은 먼저 얽힐 기술 계층과 원인 구조(근본 원인, 2차 증상, 오해를 부르는 단서)를 정한 뒤 `situation` 을 쓴다.
   단답형(`format` 이 `short-answer`)은 `references/question-format.md` 의 "단답형 규칙"을 따른다.
3. 품질 점검표를 모두 통과하는지 확인한다. 통과하지 못하면 고쳐 쓴다.

### variant: 약점 재출제용 변형

입력: `baseQuestion`(원본 문제), `weakPoints`(사용자가 놓친 항목), `existingQuestions`, `userFeedback`.

- 원본과 **같은 쟁점**을 묻되 **상황은 완전히 다르게** 만든다. 수치·이름·스택만 바꾼 문제는 중복이므로 허용하지 않는다.
- `weakPoints` 가 채점 기준의 필수 항목에 반드시 들어가게 한다.
- 형식·유형·난이도는 원본을 따른다. 주제는 쟁점이 성립하면 바꿔도 된다. 단, 요청의 `topic` 이 `custom-` 으로 시작하면 그 주제를 유지한다.

### draft-rubric: 직접 입력한 문제의 채점 기준 작성

입력: 사용자가 쓴 `title`, `situation`, `requirements`, 분류 값.

- 사용자가 쓴 `title`, `situation`, `requirements` 는 **한 글자도 바꾸지 않는다.**
- 나머지 필드(`keyIssues`, `rubric`, `perspectives`, `modelAnswer`, `relatedStudyTopics`, `recommendedLength`)를 채운다.

### duplicate-check: 중복 판정

입력: `candidate`(새 문제), `similarQuestions`(유사도가 높은 기존 문제).
결과는 `schemas/duplicate-check.schema.json` 형식이다.

- 중복의 정의: 상황과 요구가 사실상 같은 문제다. 수치·고유 명사·스택만 바꾼 문제, 난이도만 바꾼 문제도 중복이다.
- 같은 쟁점이라도 상황(원인 구조, 제약, 요구 항목)이 다르면 중복이 아니다.
- 중복이면 `duplicateOfId` 에 기존 문제 id를, 아니면 빈 문자열을 넣는다. `reason` 에 판단 근거를 한두 문장으로 쓴다.

## 사용자 피드백(출제 지침) 반영

`userFeedback` 은 사용자가 남긴 출제 지침이다. 최신 항목을 우선하고, 문제 내용·난이도·형식에 적극 반영한다.
단, 다음 규칙과 충돌하면 이 규칙이 우선한다: JSON Schema 형식, 중복 금지, 채점 기준을 비공개로 두는 문제 구조.

## 출력 규칙

- 결과는 JSON 하나만 출력한다. 설명 문장을 앞뒤에 붙이지 않는다.
- 모든 서술은 한국어로 쓴다. 기술 용어는 통용되는 번역어가 있으면 번역어를, 없으면 원어를 쓴다.
- 문장은 서술어로 끝맺는 완성된 문장으로 쓴다. 문제·모범 답안에 필자가 만든 약어를 쓰지 않는다.
