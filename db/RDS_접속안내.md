# 팀 공용 DB(RDS) 접속 안내

> 2026-09-04 신설. **서울 리전**으로 새로 판 인스턴스다.
> 이전 것(버지니아)은 왕복 **201ms** 였고 지금은 **20ms** — 약 10배다.

---

## 0. 먼저 — 이 문서에 암호는 없다

`application.yml` 은 `.gitignore` 에 있다(`Backend/.gitignore:11`). **DB 주소가
저장소에 안 올라간다는 뜻이고, 그건 의도한 것이다.** 그래서 각자 자기 기계에서
한 번 설정해야 한다.

암호는 **팀 채팅으로** 받는다. 이 파일에 적지 않는다 — 저장소는 이력이 남아서
나중에 지워도 커밋에 그대로 있다.

---

## 1. 선행 — 내 IP 를 열어 달라고 한다 (이걸 안 하면 아무것도 안 된다)

보안그룹이 **등록된 IP 만** 3306 을 통과시킨다. 등록 안 된 상태로 붙으면
에러가 아니라 **아무 반응 없이 멈췄다가 timeout** 이라, 암호가 틀린 줄 알고
한참 헤매게 된다.

```
① 내 공인 IP 확인   https://checkip.amazonaws.com  (브라우저로 열면 IP 만 뜬다)
② 이정기에게 전달   "제 IP 는 xxx.xxx.xxx.xxx 입니다"
③ 등록됐다는 답을 받고 나서 아래로
```

⚠ **집·카페 IP 는 며칠 지나면 바뀐다**(ISP 재할당). 어제 되던 게 오늘 안 되면
십중팔구 이거다 — 다시 ①부터 하면 된다.

---

## 2. `application.yml` 에 프로필 추가

`Backend/src/main/resources/application.yml` **맨 아래**에 아래를 통째로 붙인다.

```yaml
---
spring:
  config:
    activate:
      on-profile: rds
  datasource:
    url: jdbc:mysql://storeflow-db.cveoe0ya0b0h.ap-northeast-2.rds.amazonaws.com:3306/storeflow_db
    username: admin
    password: <팀 채팅으로 받은 암호>
    driver-class-name: com.mysql.cj.jdbc.Driver
```

맨 앞의 `---` 세 글자를 빠뜨리지 않는다. YAML 에서 저게 **문서 구분자**라,
없으면 위쪽 로컬 설정을 덮어써서 **로컬로 돌릴 방법이 없어진다.**

### 왜 url 을 갈아 끼우지 않고 프로필로 가르나

한 줄만 고치면 되는데 굳이 이렇게 하는 이유가 있다.

> url 을 손으로 갈아 끼우면 **되돌리는 것을 잊는다.**
> 그러면 로컬인 줄 알고 공용 DB 를 보게 되고, 내 테스트가 남의 화면에 나타난다.

프로필은 **끄면 저절로 로컬**이라 「되돌리기」라는 단계 자체가 없다.

---

## 3. 실행

| | |
|---|---|
| 로컬 docker (기본) | `gradlew bootRun` — 아무것도 안 붙인다 |
| **공용 RDS** | 아래 |

```bash
# git bash / mac
SPRING_PROFILES_ACTIVE=rds ./gradlew bootRun
```

```bat
REM 윈도우 cmd
set SPRING_PROFILES_ACTIVE=rds && gradlew bootRun
```

IntelliJ 는 `Run > Edit Configurations > Active profiles` 에 `rds` 를 적는다.

**뜰 때 로그에서 이 줄을 확인한다** — 프로필이 안 먹었는데 로컬로 잘 도는 것을
"RDS 붙었다"고 착각하는 일이 제일 흔하다.

```
The following 1 profile is active: "rds"
```

---

## 4. ⚠ 공용이라는 것의 뜻

로컬 docker 와 다르다. **한 DB 를 다 같이 본다.**

| | 로컬 docker | 공용 RDS |
|---|---|---|
| 내가 만든 리스트 | 나만 본다 | **다 본다** |
| 내가 지운 행 | 나만 없어진다 | **다 없어진다** |
| 시드 다시 굽기 | 자유 | **먼저 말하고** |

그래서 **기본값은 로컬로 두는 것이 맞다.** RDS 는 "다 같이 같은 데이터를 봐야
할 때"만 켠다 — 화면 맞춰 보기, 시연 리허설, 백엔드↔프론트 붙여 보기.

`TRUNCATE` · `DROP` · 시드 재적재는 **팀 채팅에 한 줄 남기고** 한다.

---

## 5. 내 DB 가 최신인가

스키마 14 + 데이터 12 를 한 번에 본다. **★ 가 나오면 같은 줄이 무엇을 돌릴지
말해 준다.**

```bash
mysql -h storeflow-db.cveoe0ya0b0h.ap-northeast-2.rds.amazonaws.com \
      -u admin -p --default-character-set=utf8mb4 --table storeflow_db \
      < db/check_db.sql
```

로컬 docker 면:

```bash
docker exec -i storeflow_mysql mysql -uroot -p1234 \
  --default-character-set=utf8mb4 --table storeflow_db < db/check_db.sql
```

처음부터 다 넣어야 하면 `bash db/load_all.sh` (18단계를 순서대로 + 끝나면 자동 검산).

---

## 6. 안 될 때

| 증상 | 원인 | 할 것 |
|---|---|---|
| **한참 멈췄다가** `Communications link failure` / timeout | **IP 미등록.** 제일 흔하다 | §1 |
| `Access denied for user 'admin'` | 암호 오타 | 채팅의 암호 재확인 |
| `Unknown database 'storeflow_db'` | url 의 DB 이름 오타 | §2 |
| `Public Key Retrieval is not allowed` | TLS 없이 붙었다 | url 에서 `useSSL=false` 를 **뺀다** (기본값이 맞다) |
| 기동은 되는데 조회가 다 비었다 | 프로필이 안 먹어 로컬을 보고 있다 | 로그의 `1 profile is active: "rds"` 확인 |
| `Unsupported server version` 류 | 커넥터가 낡았다 | 아래 |

### 커넥터 — 서버가 MySQL **8.4.6** 이다

`build.gradle` 의 `com.mysql:mysql-connector-j` 는 버전을 안 적어서 Spring Boot
3.3.4 가 정한 **8.3.0** 이 쓰인다. 커넥터가 서버보다 먼저 나온 조합이라
보증된 짝은 아니다. 여기서 죽으면 한 줄 박으면 된다.

```gradle
runtimeOnly 'com.mysql:mysql-connector-j:9.7.0'
```

---

## 7. 서버 사양 (참고)

```
리전       ap-northeast-2 (서울) · ap-northeast-2c
엔진       MySQL 8.4.6
DB 이름    storeflow_db
사용자     admin
문자셋     utf8mb4 / utf8mb4_0900_ai_ci
시각대     UTC   (로컬 docker 도 UTC — 두 DB 의 시각이 같다)
왕복지연   약 20ms
```

⚠ **FastAPI(Agent)는 DB 에 안 붙는다.** 설계 헌법 4 — 상태는 백엔드 한 경로로만
간다. 그래서 이 문서는 **백엔드 담당에게만** 해당한다. Agent 쪽 `.env` 는
바꿀 것이 없다.
