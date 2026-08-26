# ============================================================================
# 모드 1 DES — 검증 체크리스트 (세계명세 §7을 코드로)
# ============================================================================
# [이 파일이 본체다] 세계명세 §7: "첫 실행은 반드시 이상하게 나온다(결품 100%/0%).
#   파라미터를 조정하며 그럴듯해질 때까지 반복하는 그 루프가 본체다."
#   이 스크립트가 그 루프의 **채점표**다. mode1.py 출력을 읽고 §7 성질을 판정한다.
#
# [읽기 전용] 생성하지 않는다. out/mode1/*.csv.gz 를 읽어 PASS/WARN/FAIL만 낸다.
#   FAIL이 나오면 params.py의 해당 손잡이를 돌리고 mode1을 다시 돌린다.
#
# 실행:  python verify_history.py
# ============================================================================

from __future__ import annotations

import csv
import gzip
import os
import statistics as stt
import sys
from collections import defaultdict

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(_HERE, "..", "catalog"))
OUT = os.path.join(_HERE, "out", "mode1")
DAYS_HINT = int(sys.argv[sys.argv.index("--days") + 1]) if "--days" in sys.argv else 180

_PASS, _WARN, _FAIL = "PASS", "WARN", "FAIL"
_MARK = {_PASS: "[PASS]", _WARN: "[warn]", _FAIL: "[FAIL]"}


def _load(name):
    with gzip.open(os.path.join(OUT, name), "rt", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def check(cond_pass, cond_warn=False):
    return _PASS if cond_pass else (_WARN if cond_warn else _FAIL)


def main():
    for n in ("purchases.csv.gz", "shelf_events.csv.gz",
              "consumer_events.csv.gz", "lead_times.csv.gz"):
        if not os.path.exists(os.path.join(OUT, n)):
            raise SystemExit(f"출력이 없습니다: {n} — 먼저 mode1.py를 돌리세요.")

    lead = _load("lead_times.csv.gz")
    shelf = _load("shelf_events.csv.gz")
    pur = _load("purchases.csv.gz")

    results = []   # (판정, 제목, 상세, 손잡이)

    # ── ① 리드타임 3경로가 갈리는가 ─────────────────────────────────────────
    done = [r for r in lead if r["event"] == "1"]
    by_path = defaultdict(list)
    for r in done:
        by_path[r["path_type"]].append(float(r["duration_sec"]))
    med = {k: stt.median(v) for k, v in by_path.items() if v}
    ordered = (med.get("VERTICAL", 0) < med.get("HORIZONTAL", 1e9) < med.get("FLOOR", 1e9)) \
        and len(med) == 3
    results.append((check(ordered, len(med) >= 2),
                    "리드타임 3경로 분리",
                    " · ".join(f"{k} {med[k]:.0f}s" for k in ("VERTICAL", "HORIZONTAL", "FLOOR") if k in med),
                    "params: FLOOR_CHANGE_SEC · CELL/WALK · BACKROOM_VERTICAL_SEC"))

    # ── ② 리드타임 중앙값이 분 단위인가 ─────────────────────────────────────
    allleads = [float(r["duration_sec"]) for r in done]
    m = stt.median(allleads) if allleads else 0
    results.append((check(30 <= m <= 3600, 10 <= m <= 7200),
                    "리드타임 중앙값 분 단위", f"중앙값 {m:.0f}s", "params: HANDLING_GAMMA_*"))

    # ── ③ 긴 꼬리가 있는가 (p99/중앙값) ─────────────────────────────────────
    tail = 0
    if allleads:
        allleads.sort()
        p99 = allleads[min(len(allleads) - 1, int(len(allleads) * 0.99))]
        tail = p99 / m if m else 0
    results.append((check(tail >= 3, tail >= 2),
                    "리드타임 긴 꼬리", f"p99/중앙 = {tail:.1f}배",
                    "params: HANDLING_GAMMA_THETA · N_STAFF(대기)"))

    # ── ④ 결품이 "학습할 만큼" 일어나는가 (비율 목표 폐기 — 세계명세 §6.2 08-24 정정)
    #      재는 것: 경로 3유형 각각 stockout→restock 사이클이 충분한가.
    #      비율(70~90%)을 목표로 두면 ρ→1을 강요해 리드타임이 폭발한다(§34).
    n_stockout = sum(1 for r in shelf if r["event_type"] == "STOCKOUT")
    per_path = {k: len(v) for k, v in by_path.items()}
    enough = n_stockout >= 1000 and all(per_path.get(k, 0) >= 500
                                        for k in ("VERTICAL", "HORIZONTAL", "FLOOR"))
    results.append((check(enough, n_stockout >= 200),
                    "결품 학습신호 충분",
                    f"STOCKOUT {n_stockout:,} · 경로별 " +
                    " ".join(f"{k[:4]}{per_path.get(k, 0):,}" for k in ("VERTICAL", "HORIZONTAL", "FLOOR")),
                    "params: GUEST_DEMAND_MULT ↑ · POP_ZIPF_ALPHA ↑"))

    # ── ④-b 가동률 ρ — 손잡이를 결과가 아니라 원인에 건다 (§6.2 개정)
    busy = sum(float(r["travel_sec"]) + float(r["handling_sec"]) for r in lead)
    import params as _P
    avail = _P.N_STAFF_TOTAL * DAYS_HINT * (_P.HOUR_CLOSE - _P.HOUR_OPEN) * 3600
    rho = busy / avail if avail else 0
    results.append((check(0.6 <= rho <= 0.85, 0.4 <= rho < 1.0),
                    "가동률 ρ 0.6~0.85", f"ρ={rho:.2f} (바쁨 {busy/3600:,.0f}h / 가용 {avail/3600:,.0f}h)",
                    "params: N_STAFF_TOTAL — ρ≥1이면 백로그 폭주"))

    # ── ⑤ 중도절단 — 원천 셋이 각각 걸렸는가 (세계명세 §6.3 표)
    reasons = defaultdict(int)
    for r in lead:
        if r["event"] == "0":
            reasons[r["censor_reason"]] += 1
    n_cens = sum(reasons.values())
    frac = n_cens / len(lead) if lead else 0
    results.append((check(0.01 <= frac <= 0.15, n_cens > 0),
                    "중도절단 1~15%",
                    f"{frac:.1%} ({n_cens:,}/{len(lead):,}) · " +
                    " ".join(f"{k}={v:,}" for k, v in sorted(reasons.items())),
                    "원천 셋: SHIFT_END(교대) · WINDOW_END(창) · LOG_LOST(누락)"))

    # ── ⑤-b 절단이 정보성(informative)인가
    #      [08-24 지표 정정] 처음엔 "절단의 **관측 하한** 중앙 > 완료 중앙"으로 쟀는데
    #      **틀린 식이었다.** 관측 하한은 "언제 시작했나"에 좌우된다 — 폐점 5초 전에
    #      시작한 작업은 하한이 5초다. 그래서 진짜 오래 걸리는 작업인데도 하한은 작게
    #      찍힌다(실측 75s < 완료 501s로 나와 정상인 세계를 FAIL로 읽었다). §33 재발.
    #      재야 할 것은 "절단된 작업의 **잠재** 리드타임이 완료분보다 큰가"다 —
    #      절단 여부가 진짜 소요시간과 상관돼야 "버리면 낙관 편향"이 성립한다.
    #      잠재값은 시뮬만 아는 true_lead_sec(학습 금지, 검증 전용).
    cens_true = [float(r["true_lead_sec"]) for r in lead
                 if r["event"] == "0" and r["censor_reason"] == "SHIFT_END"]
    done_true = [float(r["true_lead_sec"]) for r in done]
    if cens_true and done_true:
        mc, md = stt.median(cens_true), stt.median(done_true)
        ratio = mc / md if md else 0
        results.append((check(ratio >= 1.5, ratio >= 1.1),
                        "절단이 정보성(informative)",
                        f"절단 잠재중앙 {mc:.0f}s / 완료중앙 {md:.0f}s = {ratio:.1f}배",
                        "SHIFT_END가 긴 작업을 골라 자르는가 — 1배면 무작위 절단"))
    else:
        results.append((_WARN, "절단이 정보성(informative)", "SHIFT_END 절단 없음",
                        "params: SHIFT_END_CENSORS"))

    # ── ⑥ 시간대 봉우리 (점심·저녁) ─────────────────────────────────────────
    hour_cnt = defaultdict(int)
    for r in pur:
        hour_cnt[int(r["purchased_at"][11:13])] += 1
    peak = max(hour_cnt.values()) if hour_cnt else 0
    lunch_eve = (hour_cnt.get(12, 0) + hour_cnt.get(18, 0)) / 2
    off = (hour_cnt.get(15, 0) + hour_cnt.get(16, 0)) / 2
    results.append((check(lunch_eve > off * 1.15, lunch_eve > off),
                    "시간대 봉우리(점심·저녁)", f"점심·저녁 {lunch_eve:.0f} vs 한산 {off:.0f}",
                    "params: HOUR_PROFILE"))

    # ── ⑦ 재구매 간격이 분산되는가 (품목 주기 반영) ─────────────────────────
    seq = defaultdict(list)
    for r in pur:
        seq[(r["member_id"], r["sku_id"])].append(r["purchased_at"])
    intervals = []
    for k, ts in seq.items():
        if len(ts) >= 2:
            ts.sort()
            days = [(_pdays(ts[i + 1]) - _pdays(ts[i])) for i in range(len(ts) - 1)]
            intervals.extend(days)
    cv = (stt.pstdev(intervals) / stt.mean(intervals)) if len(intervals) > 2 and stt.mean(intervals) else 0
    results.append((check(0.3 <= cv <= 1.5, cv > 0.15),
                    "재구매 간격 분산", f"간격 {len(intervals):,}건 · 변동계수 {cv:.2f}",
                    "params: CYCLE_SD_FRAC · FRAILTY_SD"))

    # ── ⑧ 축 조합이 실재하는가 (라벨식 퇴화 방지) ───────────────────────────
    import members_gen as mg
    members = mg.gen_members()
    combo = sum(1 for m in members if m[1] == 1 and m[2])   # hh=1 AND has_pet
    results.append((check(combo > 0),
                    "축 조합 존재 (hh=1 & pet)", f"{combo:,}명",
                    "members_gen (독립 추출) — 0이면 라벨식 회귀"))

    # ── 출력 ─────────────────────────────────────────────────────────────────
    print("=" * 74)
    print("모드 1 검증 — 세계명세 §7 체크리스트")
    print("=" * 74)
    worst = _PASS
    for verdict, title, detail, knob in results:
        print(f"{_MARK[verdict]} {title:<22s} {detail}")
        if verdict == _FAIL or (verdict == _WARN and worst == _PASS):
            print(f"        └ 손잡이: {knob}")
        if verdict == _FAIL:
            worst = _FAIL
        elif verdict == _WARN and worst != _FAIL:
            worst = _WARN
    print("=" * 74)
    n_fail = sum(1 for r in results if r[0] == _FAIL)
    n_warn = sum(1 for r in results if r[0] == _WARN)
    print(f"결과: {len(results) - n_fail - n_warn} PASS · {n_warn} WARN · {n_fail} FAIL")
    if n_fail:
        print("→ FAIL 손잡이를 params.py에서 돌리고 mode1.py를 다시 돌린다(검증 루프가 본체).")


def _pdays(ts: str) -> float:
    """'YYYY-MM-DD HH:MM:SS.mmm' → 일 단위 실수(간격 계산용)."""
    from datetime import datetime
    dt = datetime.strptime(ts[:19], "%Y-%m-%d %H:%M:%S")
    return dt.timestamp() / 86400.0


if __name__ == "__main__":
    main()
