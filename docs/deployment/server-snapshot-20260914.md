# 2026-09-14 실제 배포 코드 동기화

사용자 요청에 따라 `codex/golden-selective-20260911`에 현재 실행 중인 서버 소스를 반영했다. 기준은 기존 브랜치 `1ca7c98`이며 ljk_instant 전체 병합이나 이력 게시를 하지 않았다. 이번 작업은 Git 반영이며 운영 서버를 재배포하지 않는다.

## 가져온 실행본

| 구성요소 | 실제 서버 경로 | 확인 |
|---|---|---|
| frontend | 웹 서버 `releases/chat-connect-20260914/frontend` | Next BUILD_ID `iP0OKHNdmoPf--H0n5O9H`, 컨테이너 `2797a2e4a634` |
| Backend | 웹 서버 `releases/chat-photos-20260914/Backend` | 실행 JAR 내 모든 클래스와 소스 컴파일 결과 바이트 일치, 컨테이너 `7687f52c1a39` |
| Agent | Agent 서버 `releases/demo-fixes-641340a/Agent` | 실제 `/app` mount, 컨테이너 `203b9cf297ab` |
| Simulation | 웹 서버 `releases/1ca7c98/Simulation` | 공개 `/var/www/stock-life/simulation-1ca7c98`의 194개 파일이 해당 dist와 정확히 일치 |

기준 디렉터리 앞부분은 `/home/ubuntu/stock-life-deploy/`다. `current` 링크 하나만으로 전체 서비스 버전을 판단하면 안 된다.

## 포함된 변경

- Agent SSE 무수신 연결의 60초 후 재연결.
- 장보기 리브 버튼의 세션별 실시간 알림 미리보기.
- 사진 선택 시 미리보기, 텍스트와 명시적 동시 전송, 질문 말풍선·이력의 사진 표시.
- 소유권을 확인하는 비공개 사진 저장·조회와 Agent 사진 인식 결과 연결.
- 대화 초기 연결 실패 표시와 다시 연결 버튼.

기존 브랜치 대비 수정/추가된 운영 소스는 10개다. `server-snapshot-20260914.json`에 경로를 기록했다. 소스·설정 코드·기존 추적 자산 총 853개를 서버와 대조했다. 운영 소스 디렉터리에서 빠진 실행 코드가 브랜치에 남아 있는지도 확인했다.

검증 명령:

```sh
python docs/deployment/verify_snapshot.py
```

Windows/Git의 CRLF 차이는 텍스트에 한해 정규화하고 바이너리는 원본 바이트로 검증한다. 스냅샷 이후 코드가 바뀌면 해당 검사가 실패하는 것이 정상이다.

## 배포 시 함께 유지할 설정

운영의 `.env`, 인증키·DB 암호가 포함된 `application.yml`, 개인 업로드 사진, RDS 데이터, 프로세스/모델 캐시, 컴파일 산출물은 Git에 넣지 않았다. 안전한 `application.yml.example`를 같이 제공한다. 실제 서버 값은 기존 비공개 환경파일로 주입한다.

- Backend는 Java 21로 빌드한다. `application.yml.example`를 `Backend/src/main/resources/application.yml` 또는 Spring의 외부 설정 파일로 사용하고 필수 환경변수를 제공한다. 기존 로컬 설정이 있으면 덮어쓰지 말고 먼저 비교한다. JWT 만료 시간·내부키·SMS·RDS 값은 기존 운영값을 유지한다.
- `SPRING_JPA_HIBERNATE_DDL_AUTO=none`, `SPRING_SQL_INIT_MODE=never`를 유지하고 일반 재배포에서 DB/seed를 초기화하지 않는다.
- **사진 유지에 필수:** `CHAT_ATTACHMENTS_DIRECTORY=/chat-uploads` 및 호스트 `/home/ubuntu/stock-life-deploy/chat-uploads:/chat-uploads` 마운트. 이 저장소를 새 릴리스 디렉터리로 바꾸거나 지우면 기존 채팅 사진을 읽지 못한다.
- frontend는 현재 `package-lock.json`을 기준으로 설치·빌드한다. `NEXT_PUBLIC_*` 값은 기존 운영 환경을 그대로 사용한다. 실행 명령은 `npm run start -- --hostname 0.0.0.0`, 호스트 노출은 `127.0.0.1:3000`이다.
- Backend 실행은 `java -Xms256m -Xmx1024m -jar /app/storeflow-backend-0.0.1-SNAPSHOT.jar`다. 기존 8080 바인딩·내부 연결을 유지한다.
- Agent는 기존 모델 캐시와 환경파일을 유지하고 `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1`로 실행한다. 사진 encoder를 포함한 출하물은 기존 서버 구성을 사용한다.
- Simulation·Nginx·TLS 설정은 이번 동기화에서 변경하지 않았다. 저장소 루트의 `docker-compose.yml`은 기존 로컬 MySQL 용도이며 운영 전체 배포 구성이 아니다.

## 검증 범위

서버 스냅샷과 파일 일치, Backend 전체 빌드 및 실행 클래스 일치, frontend 전체 Next 빌드, Agent Python compile, 사진 첨부·연결 실패 복구 React DOM 회귀 검사를 수행했다. frontend 최초 로컬 빌드는 다른 브랜치의 삭제된 `/demo` 페이지를 가리키는 `.next/dev/types` 캐시 때문에 실패했고, 생성된 타입 캐시만 별도 보관한 뒤 다시 빌드했다. 운영 소스에 임의 수정으로 회피하지 않았다.

최근 실제 공개 API의 회원·비회원 사진 전송/저장/재조회 검증 결과는 warehouse 작업장의 `시연점검/사진첨부전송_20260914`와 `시연점검/비회원대화연결_20260914`에 있다. 이번 Git 동기화 때문에 주문·재고를 변경하거나 브라우저 자동화를 실행하지 않았다.
