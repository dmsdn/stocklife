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

##  만일 — 집에서 작업하고 싶다면...

보안그룹이 **등록된 IP 만** 3306 을 통과시킨다. 등록 안 된 상태로 붙으면
에러가 아니라 **아무 반응 없이 멈췄다가 timeout** 이라, 암호가 틀린 줄 알고
한참 헤매게 된다.

```
① 작업 할 곳 IP 확인   https://checkip.amazonaws.com  (브라우저로 열면 IP 만 뜬다)
② RDS 인스턴스에서 보안규칙에 들어가서 본인 아이피 등록 (클로드에게 물어보면 친절히 알려줌)
③ 귀찮으면 ljk에게 아이피 알려주시면 깨어있는 한 바로 등록해드립디ㅏ...
```

⚠ **집·카페 IP 는 며칠 지나면 바뀐다**(ISP 재할당). 어제 되던 게 오늘 안 되면
십중팔구 이거다 — 다시 ①부터 하면 된다.

---

## 2. `application.yml` 을 RDS 로

`Backend/src/main/resources/application.yml` 의 `datasource` 블록을 이렇게 바꾼다.
**로컬 블록은 지우지 말고 주석으로 남긴다** — 되돌릴 때 두 줄 맞바꾸면 끝이다.

```yaml
spring:
  datasource:
    url: jdbc:mysql://storeflow-db.cveoe0ya0b0h.ap-northeast-2.rds.amazonaws.com:3306/storeflow_db
    username: admin
    password: <팀 채팅으로 받은 암호>
    driver-class-name: com.mysql.cj.jdbc.Driver

  # ── 로컬 docker (되돌릴 때 위와 맞바꾼다) ──
  # datasource:
  #   url: jdbc:mysql://localhost:3307/storeflow_db
  #   username: root
  #   password: 1234
  #   driver-class-name: com.mysql.cj.jdbc.Driver
```

⚠ `url` 에 `useSSL=false` 를 붙이지 않는다. 안 적는 것이 기본값(`PREFERRED`)이고
그게 맞다 — 자세한 건 §6 의 `Public Key Retrieval` 줄.

---

## 3. 실행

평소대로 돌리면 된다. 붙는 곳이 파일에 박혀 있으니 붙일 게 없다.

```
gradlew bootRun
```

**뜰 때 로그에서 이 줄을 본다** — 이게 안 보이면 아직 로컬을 보고 있는 것이다.

```
HikariPool-1 - Added connection com.mysql.cj.jdbc.ConnectionImpl@...
Started StoreflowBackendApplication in 4.5 seconds
```

확실히 하려면 아무 조회나 한 번 던져 본다. RDS 라면 12개가 온다.

```
curl http://localhost:8080/api/products/categories
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
