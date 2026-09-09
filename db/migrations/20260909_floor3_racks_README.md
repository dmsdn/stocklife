# 3층 A·B 랙 번호 — 팀 적용 안내

2026-09-09 12:16 KST, 기존 Backend 설정의 **팀 RDS `storeflow_db`에 적용 완료**했다. 같은 RDS를 쓰는 팀원은 재적재 없이 화면을 새로고침해 지도·상품 위치 캐시를 갱신하면 된다. 다른 DB는 아래 절차로 갱신한다.

## 반영 내용

- A 8→12랙, B 4→8랙. 통로로 끊긴 진열 줄마다 새 랙의 B01부터 시작한다.
- 위치 ID 1,020개를 변경했다. A·B 전체 위치 1,260개, 다른 17개 구역, map_cells 21,375칸의 배치를 보존한다.
- 함께 변경한 참조는 stocks 1,020행, shelf_configs 510행, shelf_events 20,220행, consumer_events 526행이다.
- 상품의 실제 베이·단과 재고 수량, 설정값, 이벤트 내용을 보존했다. 구조화된 payload의 위치 ID도 변환하도록 구현했으며, 이번 RDS의 추가 payload 변경 대상은 0개였다.
- 외래키 검사를 끄지 않고 한 트랜잭션으로 적용했다. 실제 전체 작업 후 rollback 검증을 먼저 통과했고, 적용 후 재실행은 `already_applied`로 끝난다.

`world_gen.py`가 방향·행/열별 베이를 **연속 구간**으로 나누도록 수정했다. `map_layout.py`, `BAY_CELLS=2`, 95×75 이동 격자는 바꾸지 않았다. 위치 ID, rack_no, bay_no를 함께 맞췄으므로 팀원이 번호만 따로 수정하지 않아도 된다.

**기존 공유 DB에 `world_seed.sql` 전체를 실행하지 않는다.** 기존 DB는 아래 이관 스크립트를 사용한다. 신규 DB용 world/history/stock_sync 시드도 새 번호로 갱신했지만, 공유 DB 초기화 용도로 실행하지 않는다.

## 다른 DB에서 실행

Python에 `pymysql`, `pyyaml`이 필요하다. 인증정보는 각자의 비공개 `Backend/src/main/resources/application.yml`에서 읽으며 출력하거나 패키지에 넣지 않는다. 공식 RDS 인증서 묶음으로 TLS 인증서·호스트를 검증한다. 다른 CA를 쓰면 `--ssl-ca`를 지정한다.

저장소 루트에서:

```powershell
# 기본: 조회만 하는 사전 검사
python db/migrations/20260909_split_floor3_racks.py --output-dir .demo-runtime/rds-location-migration
# 전체 작업을 검증하되 이번 트랜잭션은 되돌림
python db/migrations/20260909_split_floor3_racks.py --output-dir .demo-runtime/rds-location-migration --rollback-test
# 백업 후 적용
python db/migrations/20260909_split_floor3_racks.py --output-dir .demo-runtime/rds-location-migration --apply
```

설정 경로가 다르면 `--config <개인 application.yml>`을 지정한다. 출력 폴더에는 실제 데이터 백업이 생기므로 Git에 추가하지 않는다. 대응표 `20260909_floor3_location_ids.csv`는 기존/신규 ID와 물리 좌표·단·랙·베이 번호를 담는다.

DB가 완전한 기존 상태일 때만 적용한다. 이미 새 상태이면 쓰지 않고, 혼합 상태나 알 수 없는 외래키가 있으면 중단한다. 임시 부모 위치로 ID 충돌을 피하고 모든 참조를 이전한 다음 임시 행을 제거한다. 오류 시 rollback한다. `--rollback-test`는 이미 완료한 적용을 취소하는 명령이 아니라 **이번 실행의 변경을 마지막에 취소하는 검사**다.

## 검증

```powershell
python Agent/sim/test_rack_layout.py
python tools/demo/check_shelf_rendering.py --base-url http://localhost:8080 --output-dir .demo-runtime/rds-shelf-check
```

19개 구역의 PDF 랙 수, 연속성·B01 재시작, 입력 순서 독립성 검사를 통과했다. RDS API의 1,684베이를 실제 Simulation 표시 함수와 대조했고 몸체·클릭 소속·L1~L3가 모두 일치했다. 8080 직접 조회와 5173 프록시 조회 모두 A 12/B 8을 반환했다.

회원·주문·채팅을 초기화하거나 시연 주문을 생성하지 않았다. 과거 대화 본문의 랙 번호는 역사 기록으로 보존한다. 학습·평가 스냅샷은 이번 변경에 섞어 수정하지 않았다.
