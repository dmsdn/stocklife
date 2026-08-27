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
from app.env import use_utf8_stdout                            # noqa: E402
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

from app import loop                       # noqa: E402
from app.tools import compute, infer, query   # noqa: E402


def _arg(flag, default=None, cast=str):
    return cast(sys.argv[sys.argv.index(flag) + 1]) if flag in sys.argv else default


def _curve(r, indent="      "):
    for p in r.get("curve", []):
        note = f"  ({p['note']})" if p.get("note") else ""
        print(f"{indent}{p['within']:>7s}  {p['prob']:>5.1f}%{note}")


def main():
    sku = _arg("--sku", 101042, int)
    photo = _arg("--photo")

    # ── ① 적재 ──────────────────────────────────────────────────────────
    print("=" * 66)
    print("출하물 적재  (Agent/app/artifacts/)")
    print("=" * 66)
    got = infer.load_all(with_photo_encoder=bool(photo))
    if not got:
        print("  ⚠ 하나도 없습니다 — models/*_ship.py · imagegen/photo_ship.py 를 돌리세요.")
    for k, v in got.items():
        print(f"  {k:16s} {v}")

    # ── 요청 하나를 흉내 낸다 ────────────────────────────────────────────
    # 루프가 요청마다 하는 주입을 여기서 손으로 한다. 이게 없으면 도구가
    # "회원이 누구인지 모른다"로 답한다(B안 — LLM이 정할 값이 아니다).
    query.set_identity(9001, "sess-7f3a9c")     # 회원 + 세션(= 매장 안)
    compute.set_position(2, 5, 15)              # 마지막 스캔 위치

    print()
    print("=" * 66)
    print(f"도구 5종  (회원 9001 · 세션 있음 · 위치 2층 (5,15) · sku {sku})")
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
        r, src = loop._dispatch("predict_repurchase", {"sku_id": sku})
        print(f"\n■ predict_repurchase   [출처 {src}]  {label}")
        if "error" in r:
            print(f"    {r['error']} — {r['message']}")
            return
        print(f"    모델 {r['model']} · 마지막 구매 {r['days_since_last']}일 전"
              f" · 과거 간격 {r['past_intervals']}회 · 전형 주기 {r['typical_cycle_days']}일")
        print("    언제까지 다시 살 확률:")
        _curve(r)

    if "--both" in sys.argv:
        # 세션이 있으면 conditional(매장 안), 없으면 unconditional(매장 밖).
        # 같은 손님·같은 상품인데 **접점이 다르면 답이 다르다** — 그걸 눈으로 본다.
        _repurchase("← 세션 있음(매장 안)", 9001, "sess-7f3a9c")
        _repurchase("← 세션 없음(매장 밖·푸시)", 9001, None)
        query.set_identity(9001, "sess-7f3a9c")
    else:
        _repurchase("", 9001, "sess-7f3a9c")

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
    print(f"    {r['error']} — {r['message']}")

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
