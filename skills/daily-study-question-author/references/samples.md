# 샘플 문제

문제의 깊이·구체성·채점 기준 작성 방식의 기준점이다. 이 샘플과 같은 쟁점의 문제는 중복이므로 만들지 않는다.

## 샘플 1. 시나리오형 · 데이터 정합성과 동시성 · Kafka · 미들

```json
{
  "format": "scenario",
  "category": "consistency-concurrency",
  "topic": "kafka",
  "difficulty": "middle",
  "title": "주문 저장과 이벤트 발행 사이의 불일치",
  "situation": "주문 서비스(Kotlin/Spring Boot, MySQL, 인스턴스 4대)는 `@Transactional` 메서드 안에서 주문을 MySQL에 저장하고 `kafkaTemplate.send()` 로 `OrderCreated` 이벤트를 발행합니다. 정산·배송 서비스가 이 이벤트를 구독합니다.\n\n운영 중에 다음 두 현상이 하루 몇 건씩 관찰됩니다.\n\n- (a) DB에는 주문이 있는데 이벤트가 발행되지 않아, 배송이 시작되지 않았습니다.\n- (b) 이벤트는 발행되었는데 DB에서는 주문이 롤백되어, 정산 서비스가 존재하지 않는 주문을 처리하려다 실패했습니다.",
  "requirements": [
    "(a)와 (b)가 각각 어떤 경로로 발생하는지 설명하세요.",
    "두 현상을 근본적으로 없애는 설계를 제시하세요.",
    "그 설계를 적용했을 때 구독하는 서비스가 지켜야 할 조건을 쓰세요."
  ],
  "recommendedLength": { "min": 500, "max": 1000 },
  "keyIssues": ["DB 커밋과 메시지 발행의 이중 쓰기", "Transactional Outbox", "컨슈머 멱등 처리"],
  "rubric": {
    "required": [
      { "point": "이중 쓰기 문제 지목", "explanation": "DB 커밋과 Kafka 발행은 하나의 원자적 단위로 묶을 수 없다는 점을 본질로 지목해야 한다." },
      { "point": "두 현상의 발생 경로", "explanation": "(b)는 발행 후 커밋 전에 예외가 나서 롤백되는 경우, (a)는 커밋 후 발행이 실패하거나 비동기 전송 실패를 무시한 경우임을 설명해야 한다." },
      { "point": "Transactional Outbox 설계", "explanation": "같은 트랜잭션 안에서 outbox 테이블에 이벤트를 기록하고, 릴레이(폴링 또는 Debezium 같은 CDC)가 발행하는 구조를 제시해야 한다." },
      { "point": "컨슈머 멱등성", "explanation": "outbox 릴레이는 at-least-once 전달이므로 구독 서비스는 이벤트 ID 기준으로 중복을 걸러야 한다." }
    ],
    "bonus": [
      { "point": "AFTER_COMMIT 리스너의 한계", "explanation": "`@TransactionalEventListener(AFTER_COMMIT)` 는 커밋 직후 프로세스가 죽으면 이벤트가 유실되므로 불충분하다." },
      { "point": "순서 보장", "explanation": "주문 ID를 메시지 키로 써서 같은 주문의 이벤트가 같은 파티션으로 가게 한다." },
      { "point": "outbox 테이블 운영", "explanation": "발행 완료 행의 정리 정책과 릴레이 지연 모니터링을 다룬다." }
    ],
    "deductions": [
      { "point": "Kafka 트랜잭션으로 해결된다는 주장", "explanation": "Kafka 트랜잭션은 Kafka 내부의 원자성만 보장하며 MySQL 트랜잭션을 포함하지 않는다." }
    ],
    "commonMistakes": [
      { "point": "send() 의 비동기성 간과", "explanation": "`kafkaTemplate.send()` 는 Future를 반환하므로 결과를 확인하지 않으면 실패를 놓친다." }
    ]
  },
  "perspectives": ["실패 시나리오의 정확성", "보장 수준 명시", "방어책의 구체성", "데이터 보정"],
  "modelAnswer": "### 1. 발생 경로\n\n문제의 본질은 **이중 쓰기**입니다. ... (생략: 실제 문제에서는 완결된 답안을 씁니다)",
  "relatedStudyTopics": ["Transactional Outbox 패턴", "Debezium CDC", "Kafka 멱등 프로듀서와 트랜잭션", "컨슈머 멱등 처리 설계"]
}
```

## 샘플 2. 개념형 · 원리 설명 · MySQL/PostgreSQL · 미들

```json
{
  "format": "concept",
  "category": "principle",
  "topic": "mysql-postgresql",
  "difficulty": "middle",
  "title": "InnoDB와 PostgreSQL의 MVCC 구현 차이",
  "situation": "MySQL InnoDB와 PostgreSQL은 둘 다 MVCC를 사용하지만 구현 방식이 다릅니다.",
  "requirements": [
    "두 DB가 이전 버전의 데이터를 어디에, 어떻게 보관하는지 설명하세요.",
    "이 차이가 운영 중에 어떤 문제로 드러나는지 서술하세요.",
    "오래 열려 있는 트랜잭션이 두 DB에 각각 어떤 영향을 주는지 설명하세요."
  ],
  "recommendedLength": { "min": 500, "max": 900 },
  "keyIssues": ["MVCC 버전 저장 방식 차이", "undo log purge와 VACUUM", "긴 트랜잭션의 영향"],
  "rubric": {
    "required": [
      { "point": "InnoDB의 버전 보관", "explanation": "레코드를 제자리에서 갱신하고 이전 버전을 undo log에 보관한다." },
      { "point": "PostgreSQL의 버전 보관", "explanation": "갱신 시 새 튜플을 만들고 이전 튜플을 테이블에 남기므로 VACUUM이 회수해야 한다." },
      { "point": "긴 트랜잭션의 영향", "explanation": "InnoDB는 purge가 막혀 history list length가 늘고 조회가 느려진다. PostgreSQL은 VACUUM이 죽은 튜플을 회수하지 못해 테이블이 비대해진다." }
    ],
    "bonus": [
      { "point": "HOT update", "explanation": "PostgreSQL은 HOT이 아닌 갱신에서 인덱스도 함께 갱신해야 한다." },
      { "point": "트랜잭션 ID wraparound", "explanation": "PostgreSQL에서 VACUUM이 오래 밀리면 wraparound 방지를 위한 강제 VACUUM이나 쓰기 중단 위험이 있다." },
      { "point": "쓰기 충돌은 여전히 락", "explanation": "MVCC는 읽기와 쓰기를 분리할 뿐, 같은 행에 대한 쓰기끼리는 락으로 충돌한다." }
    ],
    "deductions": [
      { "point": "MVCC라서 락이 필요 없다는 주장", "explanation": "쓰기끼리는 행 락이 필요하다." }
    ],
    "commonMistakes": [
      { "point": "VACUUM과 VACUUM FULL 혼동", "explanation": "일반 VACUUM은 공간을 재사용 가능하게 표시할 뿐 파일 크기를 줄이지 않는다." }
    ]
  },
  "perspectives": ["정확성", "깊이", "연결", "실무 적용"],
  "modelAnswer": "### 1. 이전 버전의 보관 방식\n\n... (생략: 실제 문제에서는 완결된 답안을 씁니다)",
  "relatedStudyTopics": ["InnoDB undo log와 purge", "PostgreSQL VACUUM과 autovacuum 튜닝", "PostgreSQL HOT update", "트랜잭션 ID wraparound"]
}
```
