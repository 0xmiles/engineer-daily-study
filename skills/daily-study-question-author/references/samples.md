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
  "situation": "## 환경\n\n- 주문 서비스(Kotlin/Spring Boot, 인스턴스 4대, MySQL 8.0 주 DB와 읽기 복제본)는 `@Transactional` 메서드 안에서 주문을 저장하고, `kafkaTemplate.send()` 로 `OrderCreated` 이벤트(메시지 키 `orderId`)를 발행한 뒤, 쿠폰 사용 처리를 하고 메서드를 끝냅니다. `send()` 의 결과는 확인하지 않습니다.\n- 정산 서비스와 배송 서비스가 이 이벤트를 구독합니다.\n- 배송 서비스는 이벤트를 받으면 주문 서비스의 `GET /orders/{id}` 로 배송지를 조회합니다. 이 API는 읽기 복제본을 조회하며, 복제 지연은 평소 0.1초 미만, 피크 시간대에 1~2초입니다. 조회 결과가 404이면 1초 간격으로 2번 재시도한 뒤, 메시지를 실패 보관 토픽으로 옮깁니다.\n\n## 관찰\n\n- (a) DB에는 주문이 있는데 배송이 시작되지 않은 주문이 하루 몇 건 있습니다. 일부는 배송 서비스에 수신 기록조차 없고, 일부는 실패 보관 토픽에 '주문 없음'으로 쌓여 있습니다.\n- (b) 정산 서비스가 존재하지 않는 주문을 처리하려다 실패하는 건이 하루 몇 건 있습니다. 해당 주문은 모두 쿠폰 처리 중 예외가 나서 롤백된 주문입니다.\n- 실패 보관 토픽의 '주문 없음' 메시지는 피크 시간대에 몰려 있고, 나중에 수동으로 다시 넣으면 대부분 정상 처리됩니다.\n- 매주 화요일 03:00~03:20에 Kafka 브로커 롤링 재시작이 있고, 팀 일부는 이것을 의심합니다. (a)는 요일과 관계없이 낮 시간대에 고르게 발생합니다.",
  "requirements": [
    "(a)와 (b)가 각각 어떤 경로로 생기는지, 근본 원인과 함께 설명하세요.",
    "배송 서비스의 실패 보관 토픽에 '주문 없음' 메시지가 피크 시간대에 몰리는 이유를 설명하세요.",
    "브로커 롤링 재시작이 원인인지 판단하고 근거를 쓰세요.",
    "즉시 완화책과 근본 해결책을 주문 서비스, Kafka 발행 경로, 구독 서비스 계층별로 쓰세요."
  ],
  "recommendedLength": {
    "min": 700,
    "max": 1300
  },
  "keyIssues": [
    "DB 커밋과 메시지 발행의 이중 쓰기",
    "커밋 전 발행과 복제 지연이 겹쳐 구독 서비스가 주문을 찾지 못하는 문제",
    "Transactional Outbox와 컨슈머 멱등 처리"
  ],
  "rubric": {
    "required": [
      {
        "point": "이중 쓰기 문제 지목",
        "explanation": "DB 커밋과 Kafka 발행은 하나의 원자적 단위로 묶을 수 없다는 점을 근본 원인으로 지목해야 한다."
      },
      {
        "point": "두 현상의 발생 경로",
        "explanation": "(b)는 발행 후 쿠폰 처리 예외로 롤백되는 경우, (a) 중 수신 기록이 없는 건은 `send()` 실패를 확인하지 않고 커밋한 경우임을 설명해야 한다."
      },
      {
        "point": "커밋 전 발행과 복제 지연의 인과",
        "explanation": "이벤트가 커밋 전에 나가고 배송 서비스가 복제본을 조회하므로, 커밋까지 남은 시간에 피크 시간대 복제 지연(1~2초)을 더한 시간이 재시도를 포함한 조회 시간(약 2초)을 넘으면 실제로 있는 주문을 '주문 없음'으로 판단한다는 연쇄를 설명해야 한다. 수동 재처리 시 대부분 성공한다는 관찰과 연결하면 충족이다."
      },
      {
        "point": "브로커 재시작 배제 근거",
        "explanation": "재시작은 매주 화요일 새벽 20분인데 (a)는 요일과 관계없이 낮 시간대에 고르게 발생한다는 점을 근거로 원인이 아니라고 판단해야 한다."
      },
      {
        "point": "계층을 넘는 해결책",
        "explanation": "주문 서비스는 같은 트랜잭션에서 outbox 테이블에 이벤트를 기록하고 릴레이(폴링 또는 Debezium 같은 CDC)가 커밋 후 발행하게 한다. 구독 서비스는 at-least-once 전달에 맞춰 이벤트 ID로 중복을 거르고, 복제 지연에 대비해 주 DB 조회, 이벤트에 필요한 데이터 포함, 백오프 재시도 중 하나를 적용해야 충족이다."
      }
    ],
    "bonus": [
      {
        "point": "AFTER_COMMIT 리스너의 한계",
        "explanation": "`@TransactionalEventListener(AFTER_COMMIT)` 는 커밋 직후 프로세스가 죽으면 이벤트가 유실되므로 불충분하다."
      },
      {
        "point": "즉시 완화",
        "explanation": "근본 해결 전까지 `send()` 결과를 확인해 실패를 기록하고, 실패 보관 토픽의 '주문 없음' 메시지를 주기적으로 재처리한다."
      },
      {
        "point": "outbox 테이블 운영",
        "explanation": "발행 완료 행의 정리 정책과 릴레이 지연 모니터링을 다룬다."
      }
    ],
    "deductions": [
      {
        "point": "Kafka 트랜잭션으로 해결된다는 주장",
        "explanation": "Kafka 트랜잭션은 Kafka 내부의 원자성만 보장하며 MySQL 트랜잭션을 포함하지 않는다."
      },
      {
        "point": "브로커 재시작이나 2차 증상만 원인으로 지목",
        "explanation": "브로커 재시작 일정이나 설정만 바꾸거나, 배송 서비스의 재시도 횟수만 늘리는 답은 감점한다. 앞의 것은 시간대로 배제되는 단서이고, 뒤의 것은 '주문 없음'만 줄일 뿐 커밋 전 발행으로 생기는 (b)와 발행 실패로 생기는 (a)를 그대로 남긴다."
      }
    ],
    "commonMistakes": [
      {
        "point": "send() 의 비동기성 간과",
        "explanation": "`kafkaTemplate.send()` 는 Future를 반환하므로 결과를 확인하지 않으면 실패를 놓친다."
      },
      {
        "point": "outbox 도입 뒤의 복제 지연",
        "explanation": "outbox 로 커밋 후 발행이 보장되어도 구독 서비스가 복제본을 조회하면 같은 '주문 없음'이 생길 수 있다는 점을 놓친다."
      }
    ]
  },
  "perspectives": [
    "실패 시나리오의 정확성",
    "보장 수준 명시",
    "방어책의 구체성",
    "데이터 보정"
  ],
  "modelAnswer": "### 1. 발생 경로\n\n문제의 본질은 **이중 쓰기**입니다. ... (생략: 실제 문제에서는 완결된 답안을 씁니다)",
  "relatedStudyTopics": [
    "Transactional Outbox 패턴",
    "Debezium CDC",
    "쓰기 후 읽기 일관성과 복제 지연",
    "컨슈머 멱등 처리 설계"
  ]
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

## 단답형 샘플

```json
{
  "format": "short-answer",
  "category": "behavior-rule",
  "topic": "kafka",
  "difficulty": "middle",
  "title": "파티션보다 컨슈머가 많은 그룹",
  "situation": "파티션이 4개인 토픽을 같은 컨슈머 그룹의 컨슈머 6개가 구독합니다. 파티션을 배정받지 못하는 컨슈머는 몇 개이고, 그 컨슈머들은 어떤 상태인가요?",
  "requirements": [],
  "recommendedLength": { "min": 1, "max": 150 },
  "keyIssues": ["그룹 내 파티션당 컨슈머 하나"],
  "rubric": {
    "required": [
      { "point": "초과한 컨슈머 2개는 유휴 상태", "explanation": "2개이고, 파티션을 배정받지 못해 메시지를 소비하지 않는 유휴 상태라고 써야 한다. 개수나 상태 중 하나만 맞으면 부분 정답이다." }
    ],
    "bonus": [],
    "deductions": [],
    "commonMistakes": [
      { "point": "컨슈머를 늘리면 무조건 처리량이 는다는 오해", "explanation": "같은 그룹의 병렬도 상한은 파티션 수다." }
    ]
  },
  "perspectives": [],
  "modelAnswer": "2개입니다. 그룹 안에서 파티션 하나는 컨슈머 하나에만 배정되므로, 남은 2개는 메시지를 소비하지 않고 대기하다가 다른 컨슈머가 빠지면 배정받습니다.",
  "relatedStudyTopics": ["Kafka 컨슈머 그룹", "파티션과 병렬도"]
}
```
