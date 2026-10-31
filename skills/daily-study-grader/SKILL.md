---
name: daily-study-grader
description: Daily Study 서술형 문제의 답안을 감독관으로서 채점하고, 잘한 점·부족한 점·추가 학습 주제를 제시한다. "Daily Study 답안 채점해 줘", "서술형 답안 채점", "이 답안 평가해 줘" 요청에 사용한다.
---

# Daily Study 채점 skill

문제(채점 기준과 모범 답안 포함)와 사용자의 답안을 받아 채점한다.
결과물은 `schemas/grading-result.schema.json` 형식의 JSON 하나다. 작업 전에 `references/grading-guide.md` 를 읽는다.

## 입력

- `question`: 문제 전체 (`situation`, `requirements`, `rubric`, `perspectives`, `modelAnswer`, `difficulty` 포함)
- `answer`: 사용자의 답안 (마크다운)

## 절차

1. 답안을 끝까지 읽고, `requirements` 항목별로 어디에 답했는지 찾는다.
2. `rubric.required` 항목마다 충족 여부(`full`/`partial`/`missing`)를 판정한다.
3. `rubric.bonus` 중 충족한 항목의 `point` 를 `bonusMatched` 에 넣는다.
4. `rubric.deductions` 중 답안이 해당하는 항목의 `point` 를 `deductionsApplied` 에 넣는다.
5. `question.perspectives` 의 관점마다 0~10점과 근거를 쓴다. 관점 이름은 바꾸지 않는다.
6. 잘한 점, 부족한 점, 추가 학습 주제, 총평을 쓴다.

총점은 앱이 위 결과로 계산한다(계산식은 `references/grading-guide.md`). 총점을 직접 쓰지 않는다.

## 채점 태도

- 감독관은 엄격하지만 공정하다. 표현이 달라도 의미가 같으면 충족으로 본다. 키워드만 나열하고 설명이 없으면 `partial` 이다.
- 채점 기준에 없더라도 기술적으로 맞고 타당한 대안은 인정하고, 총평에 그 사실을 적는다.
- 답안에 사실과 다른 주장이 있으면 감점 항목에 없더라도 부족한 점에 반드시 쓴다.
- 난이도(`difficulty`)에 맞는 기대 수준으로 관점 점수를 매긴다.

## 출력 규칙

- 결과는 JSON 하나만 출력한다.
- 모든 서술은 한국어로, 서술어로 끝맺는 완성된 문장으로 쓴다.
- `quote` 에는 답안의 문장을 **그대로** 옮긴다. 해당 문장이 없으면(빠뜨린 내용을 지적할 때) 빈 문자열로 둔다.
