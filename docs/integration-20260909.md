# 팀 최신 커밋 통합 및 검증 — 2026-09-09

## 기준과 권한

main f8b4890을 기준으로 아래 원격 브랜치를 모두 병합했다. 오라클 전체 이력은 포함하지 않았다.

| 담당 브랜치 | 검토한 최신 커밋 |
|---|---|
| branch_jmy | c723b0b |
| branch_jsw | 6a5b131 |
| branch_pew | 4e9735a |
| branch_ljk | 5340d0b |

## 추가·삭제와 충돌 판단

- jmy: 바코드 DTO/조회와 표시, 동일 origin 개발 구성, 상품 방문 후 출구 경로 유지.
- jsw: 명시적으로 삭제한 가짜 잔액과 미사용 로컬 구매·환불을 복구하지 않았다. pew에 남아 있던 이전 코드와 충돌했으며 App.tsx 전체 차이를 대조해 담당자의 최신 삭제를 적용했다. 실제 결제 화면은 유지한다.
- pew: 1·2층 핀 좌표, 지도, 자동 리스트 생성 제거, 회원 로그아웃 캐시 초기화 등 최신 frontend 전체를 유지했다.
- ljk: 실제 시계 옵션, 보충 시각/시간대 처리, 사진 실행 상태, 소비주기 예외 처리를 유지했다. main과 겹친 BACKEND_BASE_URL은 후행 슬래시 정규화까지 하는 최신 구현으로 통합했다.
- 삭제된 설정/소스 백업 파일은 삭제 상태를 유지한다. 3층 랙 마이그레이션과 새 시드를 보존하며 운영 DB에 SQL을 실행하지 않았다.

## 통합 후 발견·수정

1. BarcodeModal 자체는 비차단 패널이지만 ProductPopup의 기존 전체 화면 backdrop이 남아 스캔 화면을 막았다. 바코드 표시 중 상품 모달을 잠시 숨기고 닫으면 복원한다.
2. 로그아웃 전 시작한 회원 리스트 요청이 늦게 완료되면 캐시를 되살릴 수 있었다. 요청 토큰이 바뀐 응답은 캐시/화면에 반환하지 않는다. 새 로그인 때도 기존 회원 캐시를 먼저 비운다.
3. 동일 origin 개발 구성을 도입했지만 frontend API 기본값은 HTTP:8080이었다. 브라우저 기본 요청은 상대 /api로 보내고 Next에는 API·이미지 프록시를 추가했다. NEXT_PUBLIC_API_BASE_URL 명시 설정은 우선 유지한다.
4. infer_check.py가 제품에서 의도적으로 제거한 get_position의 x/y를 읽어 중단됐다. 현재 계약인 층·신뢰도·출처를 출력하게 수정했다. 제품 응답에 좌표를 다시 넣지 않았다.

## 실행 검증

- Backend: Java 21, `gradlew build --no-daemon` 성공. 테스트 9개 모두 통과(실제 지도 fixture를 지정하여 조건부 테스트도 실행).
- frontend: `npm ci`, `npm run build` 성공, `npm run test:integration` 14개 통과.
- Simulation: `npm ci`, `npm run build` 성공, `npm run test:auth` 5개 통과.
- Agent: compileall 성공, schema_check 도구 정의/실행 함수 24종 일치. shopping_route_check 10개, integration_http_check 4개, sim 디렉터리에서 test_rack_layout 3개 통과.
- 추가 회귀 검사: 바코드 표시/닫기, 늦은 회원 응답 거부/정상 응답 유지, 상대 API·명시 API 설정, SQL 기반 선택상품/출구 경로/타 회원 거부.
- Next 제품 서버와 Vite 개발 프록시를 함께 띄워 /, /auth/login, /scan, /checkout, /simulation/ 모두 HTTP 200과 올바른 Next/Vite 문서 응답 확인.
- infer_check mock smoke 성공. 소비주기 모델 순전파와 위치 출력 확인. mock 상품과 출하 카탈로그 불일치는 catalog_mismatch로 안전하게 응답하며 사진 encoder 미적재도 명시 오류로 응답한다.

합계: 자동 테스트 45개 통과 + 도구 계약 24종 검사. 초기 랙 검사 실패는 실행 디렉터리를 바로잡아 해결했고, 초기 infer_check KeyError는 위 계약 수정으로 해결했다.

## 팀원이 실행할 때

- frontend: `npm ci`, `npm run dev` (기본 3000). 필요 시 서버 환경변수 BACKEND_BASE_URL로 백엔드를 지정한다.
- Simulation: `npm ci`, `npm run dev`, 브라우저는 http://localhost:5173/simulation/ . iframe과 회원 토큰을 공유하려면 동일 origin 구조를 유지한다.
- 별도 프론트 개발 포트는 FRONTEND_DEV_URL로 지정한다. NEXT_PUBLIC_API_BASE_URL이 기존 파일에 있으면 그 값이 우선하므로 실제 사용할 API 주소인지 확인한다.
- Backend의 환경별 application 설정/DB 인증, Agent의 API 키·내부키는 저장소에 넣지 않는다. 기존 안전한 로컬 설정을 유지한다.
- DB 랙 변경이 아직 적용되지 않은 환경은 db/migrations/20260909_floor3_racks_README.md 절차를 확인한다. 시드 전체 재적재로 기존 회원/구매 데이터를 덮지 않는다.

## 검증 범위의 한계

AWS 재배포, 운영 RDS 쓰기(실제 구매/환불/보충), 실제 기기 카메라 스캔, 외부 LLM 유료 호출, 실제 사진 encoder 순전파는 이번 main 통합에서 수행하지 않았다. 사진 HTTP 계약 검사는 모의 추론이며 이를 실제 인식 정확도 검증으로 보지 않는다. 따라서 모든 환경과 모든 기능의 무결함을 보증하는 결과는 아니다.

Vite 큰 번들 및 Gradle 차기 버전 호환 경고가 남아 있지만 현재 빌드는 성공했다. Simulation 재고 보충의 /internal 경로는 서버간 권한 정책을 따른다. 운영 공개 접근 제한을 이 통합에서 해제하지 않았다.
