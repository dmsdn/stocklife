# STOCKLIFE 백엔드 (Backend)

소비자 웹 · AI 도우미(Agent) · 매장 시뮬레이션이 함께 쓰는 **API 서버**.
회원, 상품, 장보기 리스트, 주문 · 포인트, 매장 동선, 재고, 실시간 이벤트를 담당하고,
매장 데이터의 **단일 출처(Source of Truth)** 역할을 해요. Agent도 가격 · 재고 · 위치는 항상 이 서버에서 조회합니다.

> 담당: 팀원 (백엔드)

<br>

## 기술 스택

| 구분 | 사용 기술 |
|---|---|
| 언어 · 런타임 | Java 21 |
| 프레임워크 | Spring Boot 3.3 (Web, Data JPA, Validation) |
| DB | MySQL 8 (로컬 Docker · AWS RDS) |
| 인증 | JWT (jjwt), BCrypt 비밀번호 암호화, 전화번호 인증 |
| 실시간 | Server-Sent Events (SseEmitter) |
| 외부 API | 네이버 클라우드 SENS (문자 인증) |
| 설정 | spring-dotenv (`.env` 값을 설정 파일에서 사용) |

<br>

## 서버 사이의 관계

```
frontend ──/api──▶ Backend ──/agent/chat──▶ Agent
                     ▲  │
      /internal/**   │  │  매대 · 행동 이벤트 SSE
   (서비스 키 인증)  │  ▼
                    Agent
Backend ──/api/realtime/stream (SSE)──▶ frontend   ← 리브가 먼저 보내는 메시지
```

| 경로 | 누가 부르나 | 인증 |
|---|---|---|
| `/api/**` | 소비자 웹, 시뮬레이션 | 소비자 JWT (일부 조회는 공개) |
| `/internal/**` | Agent | `X-Internal-Service-Key` 헤더 (Backend와 Agent만 아는 키) |

- **프론트는 Agent와 직접 통신하지 않습니다.** 채팅도 `/api/chat` → Backend → Agent로 전달됩니다.
- 채팅 세션과 대화 이력은 Backend가 저장하고, Agent는 요청에 실려 온 이력만 사용합니다.

<br>

## 주요 기능

| 도메인 | 내용 |
|---|---|
| **consumer · verification** | 전화번호 문자 인증 회원가입, 로그인(JWT), 회원정보 · 생활 정보(가구원 · 반려동물 · 차량 · 자녀) |
| **product · inventory** | 상품 검색 · 상세, 층별 지도 · 매대 위치, 재고 조회, 매대 변화 이벤트 |
| **cart** | 장보기 리스트, 비회원 리스트를 회원으로 옮기는 승계(`/api/cart/migrate`), 스캔한 상품 기록 |
| **navigation** | 매장 격자 지도 위 **A\* 경로 탐색**, 층 이동(엘리베이터 · 에스컬레이터) 포함 동선 계산 |
| **order · point** | 결제, 부분 결제(실제로 스캔한 상품만), 포인트 적립 · 사용, 전자영수증 |
| **purchase** | 구매 이력, 카테고리별 소비 집계, 인기 상품 · 상품 비교 통계 |
| **chat** | 리브 대화 세션 · 이력 저장, 사진 첨부(본인만 조회 가능한 비공개 저장) |
| **realtime** | 소비자 행동 · 매대 이벤트를 Agent로 전달하는 SSE, 리브 메시지를 프론트로 전달하는 SSE |
| **notification · promotion** | 알림함, 알림 설정, 매일 아침 프로모션 알림 |
| **wishlist** | 찜 |
| **ai** | 상품 대체 추천 · 사진 검색 등 프론트 요청을 Agent로 중계 |

<br>

## 구현하면서 해결한 문제

### 1. 동선 계산이 요청마다 2초 넘게 걸리던 문제
매장 지도에는 2만개가 넘는 칸이 존재합니다. 처음에는 경로를 요청할 때마다 이 지도 전체를 DB에서 읽어 그래프를 다시 만들었고, **요청 하나에 2.26초**가 걸렸습니다. 측정해보니 A\* 계산 자체는 밀리초 단위였고, 시간 대부분이 그래프를 만드는 데 쓰이고 있었습니다.
→ 지도 그래프를 **한 번만 만들어 캐시**하고 재사용하도록 수정했습니다.

### 2. 방문 순서는 AI가, 길 찾기는 서버가
"어디부터 들를지"는 Agent가 대화 맥락을 보고 정하고, Backend는 그 순서를 바꾸지 않고 **구간마다 A\* 경로만 이어 붙여요.** 역할을 나눠서 같은 동선 API를 대화형 안내와 일반 안내에서 함께 쓸 수 있게 수정했습니다.
한 상품이 여러 매대에 있으면 재고가 가장 많은 매대를 목적지로 고릅니다.

### 3. 결제 대상은 "실제로 찍은 상품"
리스트 전체가 아니라 매장에서 **실제로 스캔한 상품만** 결제되도록 결제 대상을 명시적으로 전달받습니다. 일부만 결제한 경우에는 리스트를 완료 처리하지 않고 남은 상품을 그대로 보존합니다.

### 4. Agent 전용 내부 API 분리
회원 ID를 직접 받아 처리하는 내부 API는 사용자 JWT와 별개인 **서비스 키**로만 열려요. 이 키는 Backend와 Agent만 알고, 프론트에는 절대 노출되지 않습니다.

<br>

## 패키지 구조

```
src/main/java/com/storeflow/
├── consumer · verification   # 회원, 문자 인증
├── product · inventory       # 상품, 지도 · 매대 · 재고, 이벤트
├── cart · order · point      # 리스트, 결제, 포인트
├── navigation                # A* 동선 계산, 지도 그래프 캐시
├── purchase · wishlist       # 구매 이력 · 통계, 찜
├── chat · ai                 # 리브 대화 저장, Agent 중계
├── realtime                  # SSE 이벤트 방송
├── notification · promotion  # 알림
├── demo                      # 시연용 데이터 · 시뮬레이션 재고 보충
└── global                    # JWT, 예외 처리, 내부 API 인증, 설정
```

<br>

## 실행 방법

**JDK 21**과 MySQL이 필요해요. 로컬 MySQL은 저장소 루트의 `docker-compose.yml`로 띄워요(3307 포트).

```powershell
# 1. 저장소 루트에서 MySQL 실행 + 스키마 · 시드 적재 (최초 1회)
docker compose up -d
# Git Bash에서 실행. PC에 mysql 클라이언트가 있으면 앞의 DOCKER_MYSQL=1 과 -h 옵션은 빼도 돼요
DOCKER_MYSQL=1 bash db/load_all.sh -h host.docker.internal

# 2. 설정 파일 만들기
Copy-Item src/main/resources/application-example.yml src/main/resources/application.yml
Copy-Item .env.example .env   # 비밀값(DB 비밀번호, API 키 등)은 .env에

# 3. 실행
.\gradlew.bat bootRun
```

서버는 `http://localhost:8080`에서 실행됩니다. 정상적으로 뜨면 아래 요청에 카테고리 목록이 들어옵니다.
```powershell
curl http://localhost:8080/api/products/categories
```

`application-mysql.yml`을 따로 쓰는 경우에는 프로필을 켜서 실행합니다.
```powershell
.\gradlew.bat bootRun --args='--spring.profiles.active=mysql'
```

### 주요 설정

| 항목 | 설명 |
|---|---|
| `spring.datasource.*` | MySQL 접속 정보 (`.env`의 `DB_URL` · `DB_USERNAME` · `DB_PASSWORD`) |
| `jwt.consumer-secret` | 소비자 토큰 서명키 |
| `agent.base-url` | Agent 서버 주소 (기본 `http://localhost:8000`) |
| `internal.service-key` | Agent와 공유하는 내부 API 키. `Agent/.env`의 `INTERNAL_SERVICE_KEY`와 같아야 함 |
| `ncp.sms.*` | 문자 인증 발송 (비워두면 문자 기능만 동작하지 않음) |

`DB 연결 실패(Communications link failure)`가 나면 MySQL이 꺼져 있거나 포트(3307)가 다른 경우입니다. `docker compose up -d`로 다시 띄워보세요.
