#!/usr/bin/env bash
# ============================================================================
# DB 를 처음부터 세운다 — 한 명령 (2026-09-04 신설)
# ============================================================================
# [왜 만드나]
#   `README_시드적재.md` 에 순서와 함정이 다 적혀 있는데도, 09-04 에 실제로
#   **빠진 채로 돌아가는 DB** 가 둘 있었다(로컬·RDS 가 서로 다른 것을 빠뜨렸다).
#   그 문서 자신도 08-28 에 같은 일을 기록했다 —
#     "이 블록에 ③ 마이그레이션 네 개가 빠져 있었다. 표에는 적혀 있는데
#      **복붙하는 블록에는 없었다.** 사람은 표가 아니라 블록을 실행한다."
#
#   > 순서를 **문서에 적는 것**과 **한 번에 도는 것**은 다른 일이다.
#   > 사람이 20단계를 손으로 치면 언젠가 하나를 건너뛴다. 그게 오늘이었다.
#
# [사용]
#   로컬:  bash db/load_all.sh
#   RDS :  bash db/load_all.sh -h <엔드포인트> -u admin -p '<암호>'
#
#   ⚠ 저장소 루트에서 돌린다(경로가 상대경로다).
#   ⚠ mysql 클라이언트가 PATH 에 없으면 MYSQL 환경변수로 지정:
#        MYSQL=/c/Program\ Files/MySQL/.../mysql.exe bash db/load_all.sh
#      docker 로 대신하려면 DOCKER_MYSQL=1 (mysql:8.0 이미지를 쓴다).
#
# [끝나면 자동으로 check_db.sql 을 돌린다]
#   `--force` 는 오류를 넘기므로 **「돌렸다」가 「됐다」를 뜻하지 않는다.**
#   그래서 마지막에 반드시 검산한다. ★ 가 나오면 그 줄이 무엇을 돌릴지 말해 준다.
# ============================================================================
set -uo pipefail

HOST=127.0.0.1; PORT=3307; USER=root; PASS=1234; DB=storeflow_db
while getopts "h:P:u:p:d:" o; do case $o in
  h) HOST=$OPTARG;; P) PORT=$OPTARG;; u) USER=$OPTARG;; p) PASS=$OPTARG;; d) DB=$OPTARG;;
esac; done

# ⚠ 옵션 둘은 선택이 아니다(README §2-⑧·⑨)
#   --force                 오류에서 안 멈춘다. 중복 INSERT 는 무해하고 중단은 유해하다
#   --default-character-set 윈도우 클라이언트 기본이 euckr 이라 한글이 깨진다
OPTS="--force --default-character-set=utf8mb4"

if [ "${DOCKER_MYSQL:-0}" = "1" ]; then
  run() { docker run --rm -i mysql:8.0 mysql -h"$HOST" -P"$PORT" -u"$USER" -p"$PASS" $OPTS "$DB" "$@"; }
  chk() { docker run --rm -i mysql:8.0 mysql -h"$HOST" -P"$PORT" -u"$USER" -p"$PASS" --default-character-set=utf8mb4 --table "$DB"; }
else
  MYSQL="${MYSQL:-mysql}"
  run() { "$MYSQL" -h"$HOST" -P"$PORT" -u"$USER" -p"$PASS" $OPTS "$DB" "$@"; }
  chk() { "$MYSQL" -h"$HOST" -P"$PORT" -u"$USER" -p"$PASS" --default-character-set=utf8mb4 --table "$DB"; }
fi

step() {  # step "설명" 파일
  if [ ! -f "$2" ]; then echo "  ⚠ 없음(건너뜀): $2"; return; fi
  printf "  %-52s" "$1"
  t0=$(date +%s)
  raw=$(run < "$2" 2>&1 | grep -viE "Using a password")
  echo " $(( $(date +%s) - t0 ))초"
  # ⚠ 오류는 **한 줄도 자르지 않는다** (09-04 밤에 이것 때문에 물렸다).
  #   첫 판은 출력을 `head -3` 했다. 그런데 Migration_guest_cart_v1 의 열째 줄이
  #   `Duplicate column name 'point_balance'` 였고, 그 ALTER 가 통째로 죽으면서
  #   같은 구문의 `point_earned_total` 이 안 생겼다. 그 칸이 없으면 **로그인이 500** 이다.
  #
  #   > 여러 절이 붙은 ALTER 는 통째로 하나의 구문이다. 앞 절이 「이미 있음」이면
  #   > 정말 필요했던 뒤 절까지 같이 안 된다. --force 는 그걸 넘기고 다음으로 간다.
  #
  #   오류를 잘라 보여 주는 적재기는 **--force 의 위험을 그대로 두고 증거만 없앤다.**
  errs=$(printf '%s
' "$raw" | grep -E "^ERROR" || true)
  rest=$(printf '%s
' "$raw" | grep -vE "^ERROR" | grep -v '^[[:space:]]*$' | head -3)
  [ -n "$errs" ] && printf '%s
' "$errs" | sed 's/^/      /'
  [ -n "$rest" ] && printf '%s
' "$rest" | sed 's/^/      /'
  return 0
}

echo "■ DB 적재 — $USER@$HOST:$PORT/$DB"
echo

echo "① 세계 스키마"
step "schema_v2"                    db/schema/schema_v2.sql

echo "② 백엔드 고유 테이블"
step "backend_own_tables_current"   db/backend_own_tables_current.sql

echo "③ 마이그레이션(앞) — 테이블을 만드는 것"
step "phone_verification"           db/phone_verification.sql
step "migration_chat_v1"            db/migration_chat_v1.sql

echo "④ consumer 시드 — ⚠ chat_v2 보다 먼저 (README §2-⑩)"
step "01_consumer_seed_2000"        db/seed/01_consumer_seed_2000.sql

echo "⑤ 마이그레이션(뒤) — 칸을 더하고 기존 행을 채우는 것"
step "migration_chat_v2"            db/seed/migration_chat_v2.sql
step "Migration_guest_cart_v1"      db/Migration_guest_cart_v1.sql
# ⚠ 위 파일의 CHECK 하나가 지금 코드와 안 맞는다(README §2-⑪).
#   없으면 오류가 나지만 --force 라 넘어간다 — 새 DB 에서는 정상이다.
printf "  %-52s" "chk_cart_owner 제거"
run -e "ALTER TABLE cart_item DROP CHECK chk_cart_owner;" >/dev/null 2>&1 && echo " ok" || echo " (없음 — 새 DB 면 정상)"

echo "⑥~⑪ 세계 시드"
step "products_seed_5000"           Agent/catalog/out/products_seed_5000.sql
step "world_seed"                   Agent/sim/out/world_seed.sql
step "members_seed"                 Agent/sim/out/members_seed.sql
step "wishlist_seed"                Agent/sim/out/wishlist_seed.sql
step "history_seed (23MB · 오래 걸린다)" Agent/sim/out/mode1/history_seed.sql
# ⚠ stock_sync 는 반드시 history 다음이다(README ⑦-b) — history 가 재고를 깎으므로
#   그 뒤에 t=0 스냅샷으로 되돌려야 시연 시각의 재고가 맞는다.
step "stock_sync (⚠ history 뒤)"    Agent/sim/out/mode1/stock_sync.sql

echo "⑫~⑮ 09-01 추가분 — 빠뜨리면 로그인부터 500"
step "05_backend_gaps"              db/seed/05_backend_gaps.sql
step "Chat_attachment"              db/Chat_attachment.sql
step "03_promotions_seed_current"   db/seed/03_promotions_seed_current.sql
# ⚠ 데모 회원 이력. 이게 없으면 로그인해도 **에이전트가 구매 0건**을 본다
#   (Member.toMemberId = 10,000,000 + consumer_id 로 조회하는데 그 축이 비어 있다).
step "04_demo_accounts (데모축 이력)" db/seed/04_demo_accounts.sql
step "06_demo_orders (화면 장부)"     db/seed/06_demo_orders.sql

echo "⑯~⑱ 09-02~04 마이그레이션"
# 새 DB 는 schema_v2+world_seed 가 이미 담고 있어 대개 no-op 이지만, 기존 DB 에는 필요하다.
step "map_cells kind (09-02)"       db/migration_map_cells_kind_0902.sql
step "map_cells facility (09-03)"   db/migration_map_cells_facility_0903.sql
step "locations facility (09-03)"   db/migration_locations_facility_0903.sql
step "schema_align (09-04)"         db/migration_schema_align_0904.sql

echo
echo "■ 검산 — --force 가 오류를 넘겼을 수 있다. 「돌렸다」는 「됐다」가 아니다."
echo
chk < db/check_db.sql 2>&1 | grep -v "Using a password"
