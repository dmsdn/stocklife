# 2026-09-09 팀 브랜치 main 통합 검증

## 범위와 통합 기준

사용자 요청: branch_ljk를 포함한 모든 팀원의 최신 커밋을 2nd_Project/main에 병합하고, 충돌의 양쪽 기능과 빌드·연동을 확인한다.

| 대상 | 통합한 끝 커밋 | 설명 |
|---|---|---|
| 기존 main | 98bcda9 | 통합 시작점 |
| branch_ljk | e3f2dae | origin/branch_ljk accebec를 포함하며, 로컬 branch_ljk에 이미 커밋된 Agent 이관 패치까지 포함 |
| origin/branch_jmy | 8d4e7d8 | 백엔드·시뮬레이션 최신 |
| origin/branch_jsw | 8f541d9 | 내비게이션·결제·상품 위치 기능 |
| origin/branch_pew | 4f1f99c | 프론트 최신 |

원격의 팀 브랜치는 위 네 개다. 마지막 fetch에서도 끝 커밋이 같음을 확인했다. 원래 작업 디렉터리는 ljk_instant와 미커밋 작업을 그대로 보존하고 별도 worktree에서 병합했다. ljk_instant의 이력이나 미커밋 파일을 병합한 것이 아니다. e3f2dae는 담당 범위로 이미 분리·커밋된 branch_ljk 패치다.

병합 커밋: c243bc0(ljk), bfb530d(jmy), 86af0b0(jsw), 8c0733b(pew). 이 문서와 통합 수정은 그 다음 커밋에 기록한다. push 대상은 origin/main 하나다.

## 충돌 해결 및 실제 발견한 결함

텍스트 충돌은 Simulation/src/App.tsx 한 파일에서 발생했다. 공통 조상과 jsw의 변경 diff, jmy의 통합 App, 관련 StoreScene/GameCanvas/ShoppingListModal을 비교했다. jmy의 장바구니 경로·층 이동 구현을 바탕으로 jsw의 별도 상품 위치 핀 기능을 연결했다. LOCATE_PRODUCT 메시지, pinnedProduct 상태, 핀 표시/클릭, 목록의 위치 버튼, 도착 시 해제, 게임 이벤트 등록을 모두 보존했다. 다른 층의 같은 좌표를 지나가도 핀이 없어지지 않도록 층 검사와 콜백 의존성도 보완했다.

자동 병합 후에도 다음 결함이 있어 수정했다.

1. 홈의 getStoreDayInfo와 스캔 화면의 useProductInsights import 누락, shopping-session의 canUseStorage 미정의로 프론트 빌드 실패 → 누락 연결 복구.
2. 새 결제 화면은 스캔 상품만 표시하지만 POST 요청에서 skuIds를 생략하여 서버가 checked 상품 전체를 선택할 수 있음 → 실제 표시 상품 ID를 반복 query parameter로 전달. 빈/잘못된 ID와 음수 포인트도 요청 전에 거부.
3. 부분 결제에도 로컬 그룹을 완료 처리 → 서버가 COMPLETED로 반환한 경우만 완료·활성 스캔 선택 해제. 나머지 상품이 남는 ACTIVE 그룹은 보존.
4. 결제 완료 후 출구 안내에 필요한 paid/orderId 미기록 → 기존 스캔 앵커를 유지하며 기록. 주문 성공 뒤 보조 저장/새로고침 실패가 결제 실패 안내로 바뀌지 않도록 분리.
5. 쿠폰 선택 시 화면에서만 할인하고 OrderService에는 쿠폰 적용 계약이 없음 → 쿠폰 UI를 삭제하지 않고 현재 적용 불가 안내와 비활성 선택으로 표시. 실제 적용되지 않는 할인을 합계에서 제외. 쿠폰 결제 기능 완성으로 보고하지 않는다.
6. 상품 1개 평균 가격을 수량 대신 주문 품목 줄 수로 나눔 → 총수량으로 계산.

## 빌드와 자동 검사

Windows의 격리 worktree에서 Java 21, Node 24.18.0, 별도 Python 가상환경으로 실행했다. 기존 개발 환경/배포 서버의 패키지를 변경하지 않았다.

| 구성요소 | 명령 | 결과 |
|---|---|---|
| Backend | `./gradlew.bat clean build --no-daemon` | 컴파일·bootJar·테스트 성공. 8개 중 7 통과, 실제 지도 fixture가 필요한 1개 건너뜀 |
| frontend | `npm ci --no-audit --no-fund`, `npm run build` | 수정 후 TypeScript/Next production 빌드 성공, 정적 페이지 55개 |
| frontend | `npm run test:integration` | 8개 통과 |
| Simulation | `npm ci --no-audit --no-fund`, `npm run build -- --base=/simulation/` | TypeScript/Vite production 빌드 성공. 큰 번들 경고는 남음 |
| Agent | `python -m compileall -q app` | Python 컴파일 성공. 별도 패키징 빌드 설정은 저장소에 없음 |
| Agent | `python shopping_route_check.py` | 솔버·인증/예측 계약 10개 통과 |
| Agent | `python schema_check.py` | 도구 24개 스키마/함수 계약 통과 |
| Agent | `python integration_http_check.py` | 실제 FastAPI lifespan/HTTP 검사 4개 통과 |

frontend 수정 후 최종 빌드를 다시 실행했다. Simulation 층 판정 보완 후에도 다시 빌드했다. Backend/package.json에는 빌드 스크립트가 없으며 서버 빌드 기준은 Gradle이다.

Agent HTTP 검사에서는 mock SoT, 사진 인코더 비활성, 테스트 전용 내부 키를 사용한다. preference/availability/repurchase/photo 갤러리·지도 자산과 검색 색인 2,578개가 준비되는 것을 /health로 확인했다. 실제 SigLIP2 사진 추론이나 유료 LLM 호출 성공을 의미하지 않는다. 사진 후보 응답은 추론 대역으로 계약을 검증했다.

## 기능별 검토 근거와 남은 검증

| 기능 묶음 | 구현/연결 확인 | 실행 근거 또는 미검증 경계 |
|---|---|---|
| Agent 장보기 최적화 | routes_frontend → compute → shopping_route → Spring 경로 계약 | 10개 검사: 냉장·냉동 뒤쪽 배치, 제외 품목, 앵커, 시설 확정, 인접 층 ESC, 계산대/출구, 7품목 완전탐색 대조 |
| Spring 내비게이션 | route/matrix/cart-route 컨트롤러와 Graph/A* 호출, 기존 호환 API | NavigationCompatibility 3개, 합성 지도 경로 2개 통과. 실제 지도 fixture 1개 미실행 |
| 시뮬레이션 동선과 상품 핀 | App의 두 기능, GameCanvas/StoreScene 이벤트, 목록 위치 버튼 연결 보존 | TypeScript/Vite 통과, 코드 경로 확인. 실제 브라우저 이동/층 전환은 미실행 |
| 주문 대상과 부분 결제 | 프론트 skuIds → OrderController → OrderService 소유 상품·그룹 검사 | Spring 결제 계약 2개 및 프론트 실제 클릭 핸들러 검사(ACTIVE/COMPLETED/새로고침 실패) 통과. DB 주문 생성은 미실행 |
| 프론트 스캔/퇴장 안내 | checkout draft, shopping session, active group, checkout-complete/지도 연결 | 세션 정제·SSR·그룹 분리·paid/orderId/앵커 보존 검사 통과. 카메라 장치 미실행 |
| 사진/리스트 보조 정보 | AiProxyController, routes_frontend, product-insights/AI UI 계약 | 내부 키 없음 403, 올바른 키 통과, 사진 비활성 오류·후보 tier 구분 검사. 실제 사진 정확도/실서비스 JWT는 미검증 |
| 소비 분석/구매·영수증/포인트 | 관련 API 호출과 spending-metrics/카드 렌더 경로 검토 | 평균 수량 계산·빈 데이터 검사, 전체 프론트 빌드. RDS 실제 이력 화면 비교는 미실행 |
| 로그인·비회원 목록·시뮬 신원 전달 | auth, cart-storage, currentConsumer, FrontendPanel 경로 검토 | 타입/빌드 확인. 실제 계정 간 전환·승계 DB 검증은 미실행 |
| AI UI/알림·실시간 세션 | ai-chat-body, panel, realtime, proactive notifications 변경 검토 | 프론트 빌드 확인. SSE 재연결/유료 응답/알림 장기 실행 미실행 |
| 채팅 삭제 | ChatController → 소유자 확인 → 첨부/메시지/세션 순 삭제 검토 | Backend 빌드 확인. 실제 DB 삭제 미실행 |
| 상품 검색·위치/캐시 | 검색 응답 위치 필드, ProductSearchService, CacheConfig 연결 검토 | Backend/프론트 빌드, 핀 좌표 fallback 검사. 데이터별 위치 정합·캐시 성능은 미측정 |
| 마이페이지·회원가입·홈 등 화면 | 최신 pew 변경 및 누락 import 연결 | 모든 페이지 production 빌드. 모든 버튼/모바일 레이아웃의 브라우저 전수 검증은 미실행 |

빌드와 위 검사가 통과했다는 사실을 모든 실서비스 기능의 종단 간 검증 완료로 확대하지 않는다. 운영 RDS 쓰기, 실제 회원 구매, 카메라, 외부 LLM/사진 모델 추론은 이 통합 과정에서 호출하지 않았다.

## 재배포 전 주의할 현재 차이

이번 작업은 Git main 통합이며 AWS 재배포가 아니다. 서버에서만 수행했던 로컬 설정 패치는 자동으로 이 main에 들어오지 않는다.

- 팀 소스의 Agent BACKEND_BASE_URL은 localhost 기본값이다. 분리 EC2 배포에서 사용 중인 환경변수 읽기 패치와 사설 주소 설정을 재배포 전에 대조해야 한다.
- 팀 Simulation/src/api/cart.ts는 여전히 개발용 /internal/cart 계열을 사용한다. AWS에서 별도로 적용한 회원 JWT 기반 /api/cart 전환과 같은 상태라고 가정하면 안 된다. 기존 배포판의 인증 패치를 비교·이관한 후 재배포해야 한다. 외부 /internal 차단을 풀어 해결하지 않는다.
- 쿠폰 조회는 남아 있지만 주문 쿠폰 적용은 아직 구현되지 않았다. 결제 화면에서 사용 불가로 명시했다.
- 실제 지도 fixture를 준비하면 `STOREFLOW_MAP_FIXTURE`를 설정해 Backend 테스트를 실행하고, 별도 통합 환경에서 `Agent/route_ui_check.py --base-url ... --sku-ids ...`로 실제 지도 경로를 검증한다.
- Simulation 번들 크기 경고와 기존 의존성 보안 업데이트는 이 Git 병합 작업에서 강제 major 업데이트하지 않았다.

별도 AWS 교재나 과거 패치 문서의 상태를 이 통합 결과만으로 갱신하지 않는다. 배포 교재 최신화 때 이 문서의 인증/환경 차이와 검증 경계를 함께 반영해야 한다.
