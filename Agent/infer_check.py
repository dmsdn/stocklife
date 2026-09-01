# ============================================================================
# infer 확인용 — 추론 도구 5종을 눈으로 본다 (2026-08-25)
# ============================================================================
# [왜 따로 있나] `infer.py`는 루프가 부르는 실행부라 혼자서는 안 돈다 —
#   출하물을 적재하고, 회원·세션·위치를 주입하고, 디스패치를 거쳐야 결과가 나온다.
#   그 준비를 한 줄로 해 주는 것이 이 파일이다. **서버를 안 띄우고** 확인한다.
#
# [무엇을 확인할 수 있나]
#   ① 출하물 셋이 적재되나                       → 맨 위 표
#   ② 도구 다섯이 각자 무엇을 답하나              → 갈래별 출력
#   ③ 곡선이 실제로 어떻게 생겼나                 → 확률 표
#   ④ 세션 유무로 소비주기 모델이 갈리나          → --both
#
# 실행 (Agent/ 에서) — ⚠ **venv의 파이썬으로** 돌린다. `python`은 스토어판이 잡혀
#   joblib이 없다(그러면 사진만 올라오고 나머지 둘이 "✗ 없음"으로 보인다):
#     PY = C:\venvs\2nd_project311\Scripts\python.exe
#
#   %PY% infer_check.py                     전체
#   %PY% infer_check.py --sku 101043        다른 상품으로
#   %PY% infer_check.py --both              소비주기 두 모델 비교
#   %PY% infer_check.py --photo out.jpg     사진 (⚠ SigLIP2 3.5GB를 올린다)
# ============================================================================

from __future__ import annotations

import sys
import warnings

warnings.filterwarnings("ignore")          # sklearn 버전 경고를 눌러 표를 깨끗이

sys.path.insert(0, ".")

# ── 어느 파이썬으로 도는가 — 08-25에 여기서 한 번 헤맸다 ─────────────────────
# `python infer_check.py`로 돌리면 PATH의 파이썬이 잡히는데, 윈도우에서 그건
# 보통 `WindowsApps\python.exe`(스토어판)라 **joblib·sklearn이 없다.**
# 그러면 npz(사진)만 올라오고 joblib 쓰는 둘이 조용히 떨어진다 —
# load_all이 자산별로 감싸고 있어서 **에러가 아니라 "✗ 없음"으로 보인다.**
# 그게 "모델이 잘못됐나?"로 읽히기 쉬워서, 여기서 먼저 잡고 무엇을 쓸지 알려 준다.
def _missing():
    """이 파이썬으로 무엇을 못 하는지 먼저 알려 준다.

    [왜 필요한가 — 08-26에 두 번 헤맸다]
      ① `python infer_check.py` 로 돌리면 PATH의 스토어판이 잡혀 아무것도 없다.
      ② venv를 잡아도 **어느 venv냐**에 따라 되는 도구가 갈린다.
         하네스 `2nd_project311` 에는 transformers 가 없고,
         이미지 `storeflow_img` 에는 scikit-learn 이 없다.
    `load_all` 이 자산별로 감싸고 있어서 둘 다 **에러가 아니라 "✗ 없음"** 으로
    보인다. 그게 "모델이 잘못됐나"로 읽히기 쉬워서 여기서 먼저 잡는다.
    """
    need = {"joblib": "가용예측·소비주기", "sklearn": "가용예측·소비주기",
            "numpy": "전부", "transformers": "사진(--photo 일 때만)"}
    out = {}
    for mod, what in need.items():
        try:
            __import__(mod)
        except ModuleNotFoundError:
            out[mod] = what
    return out


# ⚠ 진입점이므로 표준출력을 먼저 utf-8로 (08-27). 이게 없어서 cp949 콘솔에서
#   곡선 표의 `—`에 UnicodeEncodeError 가 나 **사진 갈래까지 도달조차 못 했다** —
#   "사진은 계속 안 되던데"의 정체가 적재 실패가 아니라 그 앞줄의 print 였다.
#   env.py 의 헌장과 같다: 공용 준비 코드는 입구가 명시 호출한다.
from app.env import load_env, use_utf8_stdout                  # noqa: E402

# ⚠ **`load_env()` 를 먼저 부른다.** 08-28 까지 이 파일은 그걸 안 불렀고,
#   그래서 `.env` 를 못 읽어 **늘 기본값(mock)으로** 돌고 있었다.
#   가용·소비주기는 출하물이 로컬이라 티가 안 났는데, 위치·취향·사진은
#   실물 세계를 봐야 하는 것들이라 조용히 딴 세계를 재고 있었다.
#   (tool_check 머리에 적어 둔 그 덫 — 같은 집에서 두 번 밟았다.)
load_env()
use_utf8_stdout()

_gone = _missing()
if "--photo" not in sys.argv:
    _gone.pop("transformers", None)      # 안 쓸 것으로 시끄럽게 하지 않는다
if _gone:
    # ⚠ **막지 않고 알린다.** 08-26에 여기서 한 번 과하게 잠갔다 —
    #   사진만 보려면 `storeflow_img`(sklearn 없음)로 돌 수밖에 없는데,
    #   가드가 SystemExit을 내서 **정당한 실행을 막았다.**
    #   `load_all`이 자산별로 감싸므로 없는 것만 "✗"로 떨어지고 나머지는 돈다.
    #   가드의 일은 **왜 ✗인지 설명하는 것**이지 통행을 막는 것이 아니다.
    print("=" * 66)
    print("⚠ 이 파이썬으로는 못 도는 도구가 있습니다 — 그대로 진행합니다.")
    print(f"   지금: {sys.executable}")
    for m, w in _gone.items():
        print(f"     없음  {m:14s} → {w}")
    print()
    print("   ⚠ 지금은 **어느 venv도 다섯을 다 못 돌린다.**")
    print("     transformers 는 이미지 venv에만, sklearn 은 하네스 venv에만 있다.")
    print("     (main.py는 프로세스가 하나라, 사진을 서빙하려면 transformers 가")
    print("      2nd_project311 에 들어가야 한다 — 판정 대기)")
    print()
    print("   가용예측·소비주기·위치:")
    print(r"     C:\venvs\2nd_project311\Scripts\python.exe infer_check.py --both")
    print("   사진:")
    print(r"     C:\venvs\storeflow_img\Scripts\python.exe infer_check.py --photo <경로>")
    print("=" * 66)
if "numpy" in _gone:
    raise SystemExit("numpy가 없으면 아무것도 못 합니다 — venv를 확인하세요.")

from app import config, loop               # noqa: E402
from app.tools import compute, infer, query   # noqa: E402


def _pick_fixture(member, sku):
    """회원·상품을 **실행 시각에 세계에서** 뽑는다. 인자로 주면 그것을 쓴다.

    [왜] mock 과 실물은 회원·상품 번호 축이 아예 다르다(mock 9001·101042 /
      실물 시드 1001~·2000xx). 한쪽을 박아 두면 다른 쪽에서 404 로 죽는데,
      그건 도구가 아니라 검사기가 없는 것을 물어본 것이다.

    [어떻게] 구매 이력이 있는 회원을 순서대로 두드려 찾고, 그 사람이 산 상품을
      쓴다. 그러면 소비주기·취향이 실제로 값을 낼 재료가 된다.
    """
    from app import sot_client as _s
    cands = ([9001, 9002] if config.USE_MOCK_SOT else []) + list(range(1001, 1031))
    if member is not None:
        cands = [member]
    for mid in cands:
        try:
            hist = _s.get_purchase_history(mid) or []
        except Exception:                                      # noqa: BLE001
            continue
        if hist:
            return mid, (sku if sku is not None else int(hist[-1]["sku_id"]))
    return (member or cands[0]), (sku or 0)


def _arg(flag, default=None, cast=str):
    return cast(sys.argv[sys.argv.index(flag) + 1]) if flag in sys.argv else default


def _curve(r, indent="      "):
    for p in r.get("curve", []):
        note = f"  ({p['note']})" if p.get("note") else ""
        print(f"{indent}{p['within']:>7s}  {p['prob_pct']:>5.1f}%{note}")


def main():
    # ⚠ 재료를 코드에 박지 않는다 — `tool_check` 과 같은 규율이다.
    #   08-28 까지 sku 101042 · 회원 9001 을 박아 뒀는데 **그 둘은 mock 세계의
    #   것**이라, 실물 모드에서는 상품 조회가 404 로 죽었다. 검사기가 자기가
    #   재는 세계를 안 보고 있었던 셈이다.
    sku = _arg("--sku", None, int)
    member = _arg("--member", None, int)
    photo = _arg("--photo")

    # ── ① 적재 ──────────────────────────────────────────────────────────
    print("=" * 66)
    print("출하물 적재  (Agent/app/artifacts/)")
    print("=" * 66)
    # 사진을 넘겼으면 당연히 켜고, 안 넘겼어도 **서버가 켜는 설정이면 켠다**.
    # 서버(`main.py` lifespan)는 `config.LOAD_PHOTO_ENCODER` 로 부른다 —
    # 검사기가 그보다 좁게 부르면 `.env` 에서 켜 놔도 늘 "안 켜져 있음"이 뜬다
    # (08-28 에 tool_check 도 같은 구멍이었다).
    got = infer.load_all(with_photo_encoder=bool(photo) or config.LOAD_PHOTO_ENCODER)
    if not got:
        print("  ⚠ 하나도 없습니다 — models/*_ship.py · imagegen/photo_ship.py 를 돌리세요.")
    for k, v in got.items():
        print(f"  {k:16s} {v}")

    # ── 요청 하나를 흉내 낸다 ────────────────────────────────────────────
    # 루프가 요청마다 하는 주입을 여기서 손으로 한다. 이게 없으면 도구가
    # "회원이 누구인지 모른다"로 답한다(B안 — LLM이 정할 값이 아니다).
    member, sku = _pick_fixture(member, sku)
    session = "sess-7f3a9c" if config.USE_MOCK_SOT else "inferchk-session"
    query.set_identity(member, session)          # 회원 + 세션(= 매장 안)
    compute.set_position(2, 5, 15)              # 마지막 스캔 위치

    print()
    print("=" * 66)
    print(f"도구 5종  (회원 {member} · 세션 있음 · 위치 2층 (5,15) · sku {sku})")
    print("=" * 66)

    # ── ② 가용예측 ──────────────────────────────────────────────────────
    r, src = loop._dispatch("predict_availability", {"sku_id": sku})
    print(f"\n■ predict_availability   [출처 {src}]")
    if "error" in r:
        print(f"    {r['error']} — {r['message']}")
    else:
        print(f"    매대 {r['pick_qty']}개 · BULK {'있음' if r['has_bulk'] else '없음'}"
              f" · 경로 {r['path_type']} · 큐 {r['queue_len']}건")
        print("    언제까지 채워질 확률:")
        _curve(r)

    # ── ③ 소비주기 ──────────────────────────────────────────────────────
    def _repurchase(label, member, session):
        query.set_identity(member, session)
        # ⚠ 인자는 **`sku_ids`(복수)** 다. 08-27 에 이 도구가 단수에서 복수로
        #   바뀌었는데(schema_check 가 잡은 계약 구멍) 여기가 안 따라왔다 —
        #   `sku_id` 를 넘겨 `bad_arguments` 로 죽고 있었다.
        #   ⚠⚠ 내가 이걸 못 본 이유: 출력에서 `^■` 로 시작하는 줄만 훑었다.
        #     에러는 **그 다음 줄**에 찍힌다. 요약만 보면 실패가 요약 밖에 숨는다.
        r, src = loop._dispatch("predict_repurchase", {"sku_ids": [sku]})
        print(f"\n■ predict_repurchase   [출처 {src}]  {label}")
        if "error" in r:
            print(f"    ✗ {r['error']} — {r['message']}")
            return
        items = r.get("items") or []
        if not items:
            print(f"    (후보 없음) {r.get('message', '')}")
            return
        for it in items[:3]:
            if it.get("basis"):
                # 콜드스타트 — 개인 예측이 아니다. 표기를 갈라야 눈으로 안 헷갈린다.
                print(f"    [{it['basis']}] sku {it['sku_id']} · 이 상품군 전형 주기 "
                      f"{it['typical_cycle_days']}일 — **개인 예측 아님**")
            else:
                print(f"    모델 {it['model']} · sku {it['sku_id']} · 마지막 구매 "
                      f"{it['days_since_last']}일 전 · 과거 간격 "
                      f"{it['past_intervals']}회 · 전형 주기 {it['typical_cycle_days']}일")
            _curve(it)

    if "--both" in sys.argv:
        # 세션이 있으면 conditional(매장 안), 없으면 unconditional(매장 밖).
        # 같은 손님·같은 상품인데 **접점이 다르면 답이 다르다** — 그걸 눈으로 본다.
        _repurchase("← 세션 있음(매장 안)", member, session)
        _repurchase("← 세션 없음(매장 밖·푸시)", member, None)
        query.set_identity(member, session)
    else:
        _repurchase("", member, session)

    # ── ④ 위치 ──────────────────────────────────────────────────────────
    r, src = loop._dispatch("get_position", {})
    print(f"\n■ get_position   [출처 {src}]")
    print(f"    {r}" if "error" in r else
          f"    {r['floor_no']}층 ({r['x']}, {r['y']}) · 출처 {r['source']}")

    # ── ⑤ 사진 ──────────────────────────────────────────────────────────
    r, src = loop._dispatch("identify_product_photo",
                            {"image_ref": photo or "(사진 없음)"})
    print(f"\n■ identify_product_photo   [출처 {src}]")
    if "error" in r:
        print(f"    {r['error']} — {r['message']}")
        if not photo:
            print(r"    → 사진으로 시험하려면:  C:\venvs\storeflow_img\Scripts\python.exe infer_check.py --photo <파일경로>")
    else:
        print(f"    tier={r['tier']} · 소분류 {r['l2']}"
              f" · 확신(범주 {r['category_confidence']:.2f} / 품목 {r['item_confidence']:.2f})")
        for c in r["candidates"]:
            print(f"      · {c['item']:<14s} {c['name']}")

    # ── ⑥ 취향 ──────────────────────────────────────────────────────────
    r, src = loop._dispatch("match_preferences", {})
    print(f"\n■ match_preferences   [출처 {src}]")
    # ⚠ 08-28 배선 전까지 이 도구는 **항상 error 를 냈다.** 그래서 여기가
    #   `r['error']` 를 무조건 읽고 있었고, 배선된 날 KeyError 로 죽었다.
    #   스텁을 전제한 코드는 스텁이 사라지는 날 반드시 깨진다 —
    #   **모양을 가정하지 말고 물어본다.**
    if "error" in r:
        print(f"    {r['error']} — {r['message']}")
    elif "state" in r:
        print(f"    [{r['state']}] {r['message']}")
    else:
        t = r.get("taste") or []
        print(f"    회원 {r['member_id']} · 이력 {r['history_skus']}종 · "
              f"추정 축 {r['axes_inferred']}")
        print("    취향: " + " · ".join(
            f"{x['l2']}({x['bought']}종 {x['share']:.3f})" for x in t))
        for it in r.get("items", []):
            w = it["why"]
            print(f"      · {it['sku_id']} {str(it['name'])[:24]:26s} "
                  f"{w['l2']} 취향{w['l2_rank']}위"
                  f"{' ·축보정' if w.get('axis_boosted') else ''}"
                  f" · 소분류내 인기 {w['popularity_rank_in_l2']}위"
                  f"{' · 행사' if it.get('on_promo') else ''}")

    print()
    print("=" * 66)
    print("[읽는 법]")
    print("  · 출처가 전부 infer다 — 이 값으로 '재고가 있다/없다'를 주장할 수 없다.")
    print("    매장 사실은 sot에서만 온다(가드의 출처별 원장).")
    print("  · 곡선을 그대로 준다. '15분'이라고 한 점을 도구가 고르지 않는다 —")
    print("    5분 남은 손님과 30분 여유 있는 손님은 같은 곡선을 다르게 읽는다.")
    print("  · 100.0%에 '(거의 확실)'이 붙는다. 반올림이 확률을 단정으로 바꾸는 것을")
    print("    막는 자리다.")
    print("=" * 66)


if __name__ == "__main__":
    main()
