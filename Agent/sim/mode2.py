# -*- coding: utf-8 -*-
# ============================================================================
# 모드 2 — 실시간 재생 (데모의 배경 세계)
# ============================================================================
#   python sim/mode2.py --list                     창에 무엇이 얼마나 있나
#   python sim/mode2.py --speed 60 --minutes 15    15분 데모 = 세계 15시간
#   python sim/mode2.py --speed 60 --dry           보내는 척만
#   python sim/mode2.py --only RESTOCK_IN          유형 골라서
#
# ─── 무엇을 하나 ────────────────────────────────────────────────────────────
# DB 는 `DEMO_NOW`(세계 시각 2026-08-08 토 14:20)의 **스냅샷**이다. 시연을
# 시작하면 그 시점에서 세계가 멈춰 있다 — 아무도 사지 않고 아무것도 채워지지
# 않는다. 모드 2는 **그 뒤에 실제로 일어났던 일**을 배속으로 흘려보낸다.
#
#   mode1 이 적어 둔 로그 ─── DEMO_NOW 이후 구간 ───▶ POST /internal/events/shelf
#                                   (배속 60x)              │
#                                                    백엔드가 재고를 바꾸고
#                                                    SSE 로 흘린다 → 감시자
#
# ─── 왜 엔진을 다시 돌리지 않고 로그를 재생하나 ─────────────────────────────
# 설계(§8)는 "같은 엔진을 1x/60x로"였다. 그런데 **DB 가 이미 그 로그의
# DEMO_NOW 스냅샷**이다. 엔진을 새로 돌리면 난수가 갈려 스냅샷과 어긋난 세계가
# 흐르고, 그러면 "매대에 3개 남았다"는 화면과 실제가 달라진다.
# 로그 재생은 **스냅샷이 멈춘 바로 그 지점에서 이어진다** — 세계가 하나다.
#
# ─── 보내지 않는 것 둘 (중요) ───────────────────────────────────────────────
# `BELOW_PAR` · `STOCKOUT` 은 **백엔드가 스스로 낸다.** `applyChange` 가 재고를
# 깎다가 par 밑으로 내려가면 그 자리에서 BELOW_PAR 를, 0이 되면 STOCKOUT 을
# 적는다. 우리가 또 보내면 **같은 사건이 두 번** 적히고, 자발형 감시자는
# 그것을 두 번의 신호로 본다. (창구도 그 둘을 400 으로 거절한다 — 설계된 거절이다.)
#
# ─── ⚠ 되돌릴 수 없다 ──────────────────────────────────────────────────────
# `demo_inject.py` 는 몇 건이라 되돌리기 장부를 남긴다. 여기는 15분에 수천 건이
# 나간다 — 되돌리기는 **시드 재적재**뿐이다(`db/README_시드적재.md`).
# 그래서 기본값이 `--dry` 에 가깝게 굴도록 시작 전에 규모를 보여주고 묻는다.
# ============================================================================
import argparse
import csv
import gzip
import os
import queue
import sys
import threading
import time
from collections import Counter
from datetime import datetime, timedelta

# ── 저장소 루트 찾기 (배치 무관) ────────────────────────────────────────────
# 이 파일은 두 곳에서 돈다: warehouse 는 `<루트>/sim`, 팀 저장소는
# `<루트>/Agent/sim` 다. 그래서 "두 칸 위가 루트"라고 박으면 한쪽에서 깨진다
# (팀 저장소에서는 `Agent/Agent/app/artifacts` 를 찾게 된다).
#
# **위로 올라가며 `Agent/app` 을 품은 조상을 찾는다.** 그러면 같은 파일이 양쪽에서
# 그대로 돈다 — 옮길 때 사람이 고칠 것이 없다.
# ⚠ 형제 참조(`../catalog` 등)는 이 처리가 필요 없다. 묶음이 함께 움직이므로
#   두 배치에서 이미 같다. 고쳐야 하는 것은 **묶음 밖을 가리키는 것뿐**이다.
def _find_root(start: str) -> str:
    d = start
    while not os.path.isdir(os.path.join(d, "Agent", "app")):
        parent = os.path.dirname(d)
        if parent == d:
            raise SystemExit(
                "저장소 루트를 못 찾았다 — `Agent/app` 을 품은 조상이 없다.\n"
                f"  시작점: {start}")
        d = parent
    return d


_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = _find_root(_HERE)
sys.path.insert(0, os.path.join(_ROOT, "Agent"))
from app import env                                    # noqa: E402
env.use_utf8_stdout()
env.load_env()
from app import config                                 # noqa: E402  ← load_env() 뒤

LOG = os.path.join(_HERE, "out", "mode1", "shelf_events.csv.gz")

# 창구가 받는 것만 보낸다. 나머지는 백엔드가 스스로 만든다(위 주석).
SENDABLE = {"SALE", "RESTOCK_IN", "MOVE", "ITEM_CONFIRMED",
            "TASK_QUEUED", "TASK_STARTED"}
DERIVED = {"BELOW_PAR", "STOCKOUT"}


def _parse(ts: str) -> datetime:
    """'2026-08-08 14:20:00.114' → datetime. 밀리초는 있어도 없어도 된다."""
    return datetime.strptime(ts[:19], "%Y-%m-%d %H:%M:%S")


def read_window(start: datetime, world_seconds: float, only: set | None):
    """로그에서 [start, start+창] 구간을 뽑아 (세계시각, 행) 목록으로.

    [왜 통째로 메모리에 올리나] 창이 15시간이면 만 건 남짓이다. 반대로
      스트리밍으로 읽으면 **시작 전에 규모를 못 보여준다** — 되돌릴 수 없는
      작업에서 "얼마나 나가는지 모른 채 시작"은 하면 안 되는 것이다.
    """
    if not os.path.exists(LOG):
        raise SystemExit(f"로그가 없다: {LOG}\n"
                         "  먼저 `python sim/mode1.py --full` 을 돌려라.")
    end = start + timedelta(seconds=world_seconds)
    rows, skipped = [], Counter()
    with gzip.open(LOG, "rt", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            t = _parse(r["occurred_at"])
            if t < start:
                continue
            if t > end:
                break                      # 로그는 시각 순이다 — 더 볼 필요 없다
            et = r["event_type"]
            if et in DERIVED:
                skipped[et] += 1           # 백엔드가 스스로 낸다
                continue
            if et not in SENDABLE or (only and et not in only):
                skipped[et] += 1
                continue
            rows.append((t, r))
    return rows, skipped


def _body(r: dict) -> dict:
    """행 하나를 창구가 받는 모양으로. **없는 칸은 넣지 않는다.**

    [왜] `qty` 는 SALE/RESTOCK_IN 에만, `toLocationId` 는 MOVE 에만 쓰인다.
      늘 넣으면 백엔드가 무시하긴 하지만, 요청 본문이 **그 이벤트가 무엇인지**를
      스스로 말하지 않게 된다 — 로그를 나중에 읽는 사람이 헷갈린다.
    """
    b = {"eventType": r["event_type"], "skuId": int(r["sku_id"]),
         "locationId": r["location_id"]}
    if r["event_type"] in ("SALE", "RESTOCK_IN"):
        b["qty"] = abs(int(r["qty"] or 0))
    if r.get("task_id"):
        b["taskId"] = r["task_id"]
    return b


def post_shelf(body: dict, timeout: float = 10.0) -> tuple[bool, str]:
    """`POST /internal/events/shelf`. 예외를 던지지 않고 값으로 돌려준다.

    ⚠ 시연 도중이면 **왜 안 됐는지가 화면에 보여야** 한다. 트레이스백이 뜨면
      그 자리에서 읽을 수가 없다(`demo_inject.post_shelf` 와 같은 규율).

    [반환] True = 들어갔다 / None = **빈 매대**(409, 실패가 아니다) / False = 실패.
      셋으로 가르는 이유는 `play` 의 「어긋남은 사고가 아니다」 절에 적었다.
    """
    import httpx
    url = config.BACKEND_BASE_URL + "/internal/events/shelf"
    headers = {"X-Internal-Service-Key": os.environ.get("INTERNAL_SERVICE_KEY", "")}
    try:
        r = httpx.post(url, json=body, headers=headers, timeout=timeout)
    except Exception as e:                                     # noqa: BLE001
        return False, f"{type(e).__name__}: {e}"
    if r.status_code == 201:
        return True, "201"
    # 409 「재고가 부족」은 **실패가 아니라 결과**다 — 아래 `play` 의 주석 참조.
    if r.status_code == 409 and "부족" in r.text:
        return None, "409 빈 매대"
    return False, f"{r.status_code} {r.text[:160]}"


def play(rows, speed: float, dry: bool, workers: int) -> int:
    """세계 시각을 벽시계에 매핑해 순서대로 내보낸다.

    [매핑] `벽시계 = 시작한 순간 + (세계시각 − 창 시작) / 배속`.
      배속 60이면 세계 1분이 벽시계 1초다.

    ─── 왜 여러 갈래로 보내나 (08-28 실측) ─────────────────────────────────
    한 줄로 보냈더니 **초당 4건**이었다(POST 하나가 ~250ms — DB 쓰기 + SSE
    방송). 60x 데모에 필요한 것은 **15.2건/초**라, 15초 재생에 13.3초가
    뒤처졌다. 배속을 못 지키면 "세계가 흐른다"가 아니라 "느리게 샌다"가 된다.

    ─── 순서를 어떻게 지키나 — 로케이션으로 쪼갠다 ─────────────────────────
    갈래를 늘리면 순서가 섞인다. 그런데 **아무 순서나 섞여도 되는 게 아니다.**
      · `applyChange` 는 **덧셈**이다(+qty / −qty). 같은 자리의 SALE 과
        RESTOCK_IN 이 뒤바뀌어도 **최종 수량은 같다.** 달라지는 것은 중간에
        BELOW_PAR·STOCKOUT 이 뜨느냐다 — 그게 킬링 장면 1의 재료라 중요하다.
      · `MOVE` 는 덧셈이 아니다. 순서가 바뀌면 물건이 엉뚱한 자리로 간다.
        (DES 는 MOVE 를 안 내지만, 시나리오 주입이 섞일 수 있다.)
    그래서 **로케이션 번호로 갈래를 정한다**(해시 샤딩). 같은 자리의 사건은
    늘 같은 갈래로 가므로 **자리마다 순서가 보장**되고, 다른 자리끼리만
    나란히 간다. 자리가 3,400개니 8갈래에 고루 퍼진다.

    ⚠ 갈래를 늘리는 것으로 순서를 사는 게 아니다 — **쪼개는 축을 고르는 것**이
      순서를 산다. `sku` 로 쪼개도 될 것 같지만 안 된다: 한 SKU 가 PICK·BULK
      두 자리에 있고 MOVE 는 그 둘을 잇는다.

    [뒤처지면 몰아 보내지 않는다] 그래도 밀리면 밀린 것을 한꺼번에 쏟지 않고
      **얼마나 뒤처졌는지를 알린다.** 몰아 보내면 그 순간 감시자가 수십 개
      신호를 동시에 받아 개입 예산을 한 번에 태운다 — 데모에서 제일 보기
      싫은 장면이다.

    ─── 어긋남은 사고가 아니다 — 409 「빈 매대」 ───────────────────────────
    로그의 SALE 을 보냈는데 백엔드가 *"재고가 부족합니다. 현재=0, 요청=−2"* 로
    거절하는 일이 있다. **이것은 실패가 아니다.**

    재생은 **기록된 세계**를 **살아 있는 DB** 위에 붓는 일이다. 둘은 반드시
    조금씩 어긋난다:
      · 스냅샷 이후 누가 `demo_inject` 로 뭔가 주입했다
      · 앞선 재생을 중간에 끊었다(세계가 더 이른 시각에 멈춰 있다)
      · DES 의 매대 수량 모델과 백엔드의 `stocks` 가 같은 값을 조금 다르게 센다
    그래서 어떤 자리는 로그보다 먼저 바닥난다. 그때 백엔드가 음수를 거부하는
    것은 **옳은 동작**이다 — 재고가 −2 가 되면 그 뒤 모든 판정이 거짓이 된다.

    ⚠ 이것을 실패로 세면 시연 중에 빨간 경고가 줄줄 뜬다. 그러면 **진짜 실패**
      (401·500·연결 거부)가 그 속에 묻힌다. 그래서 따로 센다.
      빈 매대가 많다는 것은 "세계가 로그보다 앞서 있다"는 뜻이므로,
      그 숫자 자체가 **다시 적재할 때가 됐다**는 신호다.

    [Ctrl+C] 중간에 끊어도 된다. 이미 나간 것은 남고, 세계는 그 시점까지
      진행된 상태로 멈춘다. 어긋난 상태가 아니라 **더 이른 시각의 세계**다.
    """
    t0_world = rows[0][0]
    t0_wall = time.time()
    lag_max = 0.0
    last_report = t0_wall
    tally = {"ok": 0, "bad": 0, "empty": 0}
    lock = threading.Lock()

    qs = [queue.Queue() for _ in range(max(1, workers))]

    def worker(q):
        while True:
            item = q.get()
            if item is None:
                q.task_done()
                return
            good, msg = post_shelf(item)
            with lock:
                if good is True:
                    tally["ok"] += 1
                elif good is None:
                    tally["empty"] += 1      # 빈 매대 — 사고가 아니다
                else:
                    tally["bad"] += 1
                    if tally["bad"] <= 10:   # 처음 열 건만 — 그 뒤는 숫자로 족하다
                        print(f"   ⚠ {item['eventType']} "
                              f"sku={item['skuId']} → {msg}")
            q.task_done()

    threads = []
    if not dry:
        for q in qs:
            th = threading.Thread(target=worker, args=(q,), daemon=True)
            th.start()
            threads.append(th)

    for i, (t, r) in enumerate(rows):
        due = t0_wall + (t - t0_world).total_seconds() / speed
        gap = due - time.time()
        if gap > 0:
            time.sleep(gap)
        else:
            lag_max = max(lag_max, -gap)
        if dry:
            tally["ok"] += 1
        else:
            # 로케이션으로 갈래를 정한다 — 같은 자리는 늘 같은 갈래(순서 보장).
            qs[hash(str(r["location_id"])) % len(qs)].put(_body(r))
        now = time.time()
        if now - last_report >= 5.0 or i == len(rows) - 1:
            with lock:
                ok, bad, emp = tally["ok"], tally["bad"], tally["empty"]
            wt = t.strftime("%m-%d %H:%M")
            queued = sum(q.qsize() for q in qs)
            print(f"   [{now - t0_wall:5.0f}초] 세계 {wt} · "
                  f"{i + 1:,}/{len(rows):,} · 성공 {ok:,}"
                  + (f" 빈매대 {emp:,}" if emp else "")
                  + (f" 실패 {bad:,}" if bad else "")
                  + (f" · 대기 {queued:,}" if queued else "")
                  + (f" · 최대지연 {lag_max:.1f}초" if lag_max > 1 else ""))
            last_report = now

    if not dry:
        # 다 보낼 때까지 기다린다 — 여기서 안 기다리면 프로세스가 먼저 죽어
        # **마지막 수백 건이 조용히 사라진다.**
        left = sum(q.qsize() for q in qs)
        if left:
            print(f"   … 남은 {left:,}건 전송 중")
        for q in qs:
            q.join()
        for q in qs:
            q.put(None)

    ok, bad, emp = tally["ok"], tally["bad"], tally["empty"]
    if emp:
        print(f"\n  빈 매대 {emp:,}건 — 그 자리는 로그보다 먼저 바닥났다. "
              f"사고가 아니다.")
        if emp > ok * 0.2:
            print("  ⚠ 비율이 높다(20% 초과). 세계가 로그보다 많이 앞서 있다 — "
                  "시드를 다시 적재할 때다.")
    print(f"\n■ 재생 끝 — 성공 {ok:,} · 빈매대 {emp:,} · 실패 {bad:,}"
          + (f"\n  ⚠ 최대 {lag_max:.1f}초 뒤처졌다. 배속을 낮추거나 "
             f"--workers 를 올려라." if lag_max > 2 else ""))
    return 0 if bad == 0 else 1


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--speed", type=float, default=60.0,
                    help="배속. 60이면 세계 1분 = 벽시계 1초")
    ap.add_argument("--minutes", type=float, default=15.0,
                    help="벽시계 기준 재생 길이(분). 세계 시간 = 이것 × 배속")
    ap.add_argument("--from", dest="start", default=None,
                    help="세계 시각 시작점. 기본은 config.DEMO_NOW")
    ap.add_argument("--only", default="",
                    help="쉼표로 유형 골라서 (예: RESTOCK_IN,TASK_QUEUED)")
    ap.add_argument("--workers", type=int, default=8,
                    help="동시 전송 갈래. 로케이션으로 샤딩해 자리별 순서는 지킨다")
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--list", action="store_true",
                    help="창에 무엇이 얼마나 있는지만 보고 끝")
    ap.add_argument("--yes", action="store_true",
                    help="확인 묻지 않고 바로 (되돌릴 수 없다)")
    a = ap.parse_args()

    start = _parse(a.start) if a.start else config.DEMO_NOW
    world_sec = a.minutes * 60.0 * a.speed
    only = {x.strip() for x in a.only.split(",") if x.strip()} or None

    print(f"■ 모드 2 — 실시간 재생")
    print(f"  세계 {start:%Y-%m-%d %H:%M} 부터 {world_sec / 3600:.1f}시간분을 "
          f"{a.minutes:.0f}분에 (배속 {a.speed:g}x)")
    rows, skipped = read_window(start, world_sec, only)
    if not rows:
        print("  창에 보낼 이벤트가 없다. --from 이 로그 범위 밖이거나 "
              "--only 가 너무 좁다.")
        return 2

    c = Counter(r["event_type"] for _t, r in rows)
    print(f"  보낼 것 {len(rows):,}건  {dict(c)}")
    rate = len(rows) / (a.minutes * 60)
    print(f"  평균 {rate:.1f}건/초 · 갈래 {a.workers}")
    # 실측 처리량 ~4건/초/갈래(POST 하나가 ~250ms). 모자라면 미리 말한다 —
    # 15분을 다 돌리고 나서 "뒤처졌다"고 알면 그 15분이 버려진다.
    cap = 4.0 * a.workers
    if rate > cap:
        print(f"  ⚠ 갈래 {a.workers}개의 처리 한계는 약 {cap:.0f}건/초다. "
              f"뒤처진다 — --workers 를 {int(rate / 4) + 1} 이상으로 올리거나 "
              f"--speed 를 {a.speed * cap / rate:.0f} 이하로.")
    if skipped:
        d = {k: v for k, v in skipped.items() if k in DERIVED}
        o = {k: v for k, v in skipped.items() if k not in DERIVED}
        if d:
            print(f"  안 보냄(백엔드가 스스로 낸다) {d}")
        if o:
            print(f"  안 보냄(유형 필터) {o}")

    if a.list:
        return 0
    if not a.dry and not a.yes:
        print("\n  ⚠ **되돌릴 수 없다.** 되돌리기는 시드 재적재뿐이다.")
        print("     계속하려면 --yes, 연습이면 --dry")
        return 3

    print()
    return play(rows, a.speed, a.dry, a.workers)


if __name__ == "__main__":
    raise SystemExit(main())
