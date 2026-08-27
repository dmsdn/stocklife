# ============================================================================
# 추론형 도구 5종의 실행부 — 자산과 발화를 잇는 층
# ============================================================================
# [이 파일이 하는 일] `Agent/app/artifacts/`에 저장된 출하물을 읽어, 도구 호출
#   하나를 **손님에게 말할 수 있는 모양**으로 바꾼다. 학습은 여기서 하지 않는다.
#
#   models/hazard_ship.py     ┐
#   models/repurchase_ship.py ├→ artifacts/*.joblib·npz →  [이 파일] → 루프 → 발화
#   imagegen/photo_ship.py    ┘        (학습·묶기)          (적재·순전파)
#
# [자립해야 한다 — 가장 중요한 제약]
#   이 파일은 `models/`·`imagegen/`을 **import할 수 없다.** 팀 저장소(2nd_Project)에
#   그 폴더가 아예 없기 때문이다 — 손코딩으로 넘어가는 것은 `Agent/` 아래뿐이다.
#   그래서 출하물을 **직접** 읽는다(joblib·npz). 학습 쪽 코드에 기대면 배포가 깨진다.
#
# [헌법 6 — 모델은 lifespan 1회 로드 상주]
#   적재는 `main.py`의 lifespan이 `load_all()`을 부르는 것으로 끝난다. 요청 핸들러
#   안에서 로드하면 매 요청마다 수백 MB를 읽어 응답이 초 단위로 늘어진다.
#   ⚠ 사진 모델(SigLIP2 3.5GB)은 **선택 적재**다 — `config.LOAD_PHOTO_MODEL`이
#     꺼져 있으면 갤러리만 올리고 이미지 인코더는 안 올린다. 데모에 사진 기능을
#     안 쓰는데 3.5GB를 상주시킬 이유가 없다.
#
# [헌법 8 — 이진 분류 금지] 반환은 항상 **구간별 곡선**이다. "채워집니다/아닙니다"가
#   아니라 "10분 40% · 20분 85%". 발화 서식이 그 곡선을 문장으로 바꾼다.
#
# [출처 원장] 이 파일의 결과는 전부 `"infer"`다(loop._dispatch가 붙인다).
#   가드의 출처별 원장은 **매장 사실을 sot에서만** 인정하므로, 여기서 나온 값으로
#   "재고가 있다/없다"를 주장할 수 없다. 확률과 후보만 말한다.
#
# ─── 개념 사전 — 이 파일에 처음 나오는 것 (51)~(56) ──────────────────────────
# (51) joblib          numpy 배열이 많이 든 객체를 pickle보다 빠르게 저장·복원한다.
#                      scikit-learn 모델의 사실상 표준 저장 형식.
# (52) 모듈 전역 캐시   `_STATE`에 담아 한 번만 읽는다. lifespan이 채우고 도구가 읽는다.
# (53) 지연 import      함수 안에서 import한다. 무거운 것(torch)을 **쓸 때만** 올린다.
# (54) `dict.get(k, d)` 없으면 기본값. 계약이 아직 안 정해진 칸을 안전하게 읽는다.
# (55) 조기 반환        조건이 안 맞으면 즉시 error dict을 돌려준다. 중첩을 줄인다.
# (56) `np.searchsorted` 정렬된 경계 배열에서 값이 들어갈 자리를 이분 탐색으로 찾는다.
# ============================================================================

from __future__ import annotations

import os
from datetime import datetime

import numpy as np

from app import config, sot_client

_HERE = os.path.dirname(os.path.abspath(__file__))
ARTIFACTS = os.path.abspath(os.path.join(_HERE, "..", "artifacts"))

# (52) 모듈 전역 — lifespan이 채우고 도구가 읽는다. None이면 "아직 안 올렸다".
_STATE: dict = {"availability": None, "repurchase": None,
                "photo": None, "photo_encoder": None}


# ── 적재 ────────────────────────────────────────────────────────────────────
def load_all(with_photo_encoder: bool = False) -> dict:
    """출하물을 상주시킨다. main.py의 lifespan이 **한 번** 부른다.

    없는 자산은 조용히 건너뛴다 — 셋 중 둘만 있어도 그 둘은 돌아야 한다.
    무엇이 올라왔는지를 돌려주므로 서버 로그에 찍어 확인할 수 있다.
    """
    got = {}

    # ⚠ **하나가 죽어도 나머지는 살아야 한다.** 08-25에 실제로 겪었다 —
    #   B가 sklearn 1.7.2로 저장한 소비주기 joblib이 A(1.9.0)에서 안 열렸다
    #   (`ModuleNotFoundError: No module named '_loss'`). 그때 load_all 전체가
    #   죽으면 **가용예측·사진까지 같이 못 쓴다.** 자산 하나의 문제가 서버 전체를
    #   내리면 안 된다. 그래서 각각을 따로 감싸고, 실패는 got에 이유로 남긴다.
    def _try(name, fn):
        try:
            got[name] = fn()
        except Exception as e:                                 # noqa: BLE001
            got[name] = f"✗ {type(e).__name__}: {str(e)[:80]}"

    def _load_availability():
        import joblib                                          # (53)
        _STATE["availability"] = joblib.load(
            os.path.join(ARTIFACTS, "availability_model.joblib"))
        return _STATE["availability"]["version"]

    def _load_repurchase():
        import joblib
        _STATE["repurchase"] = joblib.load(
            os.path.join(ARTIFACTS, "repurchase_model.joblib"))
        return _STATE["repurchase"].get("version", "?")

    if os.path.exists(os.path.join(ARTIFACTS, "availability_model.joblib")):
        _try("availability", _load_availability)
    if os.path.exists(os.path.join(ARTIFACTS, "repurchase_model.joblib")):
        _try("repurchase", _load_repurchase)

    p = os.path.join(ARTIFACTS, "photo_gallery.npz")
    if os.path.exists(p):
        d = np.load(p, allow_pickle=True)
        b = {k: d[k] for k in d.files}
        # float16으로 저장돼 있다 — float32로 되돌리고 **재정규화**한다.
        # 반올림으로 노름이 1에서 살짝 벗어나 있어서, 안 고치면 코사인이 아니라
        # 그냥 내적이 된다(photo_ship.py의 같은 주석).
        E = b["emb"].astype(np.float32)
        b["emb"] = E / np.linalg.norm(E, axis=1, keepdims=True)
        b["model_id"] = str(b["model_id"])
        # 허브성 보정 벡터가 없으면 08-26 이전 판이다. 조용히 넘기면 서빙이
        # 보정 없이 돌면서 소분류가 다시 허브로 쏠린다 — 적재를 거부한다.
        # (`load_all`이 자산별로 감싸므로 다른 둘은 그대로 올라온다)
        if "hub_r" not in b:
            raise RuntimeError(
                "photo_gallery.npz에 hub_r(허브성 보정)이 없습니다 — 08-26 이전 판." + "\n"
                "  imagegen/photo_ship.py 로 재생성하세요.")
        _STATE["photo"] = b
        got["photo"] = f'{b["version"]} ({len(b["sku"]):,} SKU)'

    if with_photo_encoder and _STATE["photo"] is not None:
        _load_photo_encoder()
        got["photo_encoder"] = _STATE["photo"]["model_id"]

    return got


def _load_photo_encoder():
    """SigLIP2 이미지 인코더를 상주시킨다. **3.5GB짜리라 선택 적재다.**"""
    import torch                                               # (53)
    from transformers import AutoModel, AutoProcessor
    mid = _STATE["photo"]["model_id"]
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model = AutoModel.from_pretrained(mid).to(dev).eval()
    proc = AutoProcessor.from_pretrained(mid)
    _STATE["photo_encoder"] = (model, proc, dev)


def loaded() -> dict:
    """무엇이 올라와 있나 — /health가 읽는다."""
    return {k: (v is not None) for k, v in _STATE.items()}


# ── 공통 도구 ───────────────────────────────────────────────────────────────
def _humanize(v: int, unit: str) -> str:
    """구간 상한을 **손님이 쓰는 단위**로 적는다. 1800초 → "30분".

    [왜 도구가 환산하나 — LLM 이 하면 안 되나]
      08-27 실물 골든셋에서 곡선이 "1800초 내 40%"를 줬고, 모델은 당연히
      "30분 내 40%"라고 말했다. 그런데 **30 은 원장에 없는 수**라 가드가 발화를
      막았다. 여기서 선택지가 둘이었다:
        (a) 가드에 "1800/60 은 봐준다"는 예외를 판다 → 산술 구멍이 열린다
        (b) 도구가 사람 단위로 낸다 → LLM 은 인용만 한다
      (b) 를 고른다. 헌법 2 는 "LLM 에게 산술 금지"인데, **단위 환산도 산술이다.**
      그리고 애초에 "1800초 내 보충됩니다"는 손님에게 쓸 수 없는 문장이라,
      환산은 표현 취향이 아니라 **도구가 마땅히 했어야 할 일**이었다.

    [왜 반올림하지 않고 나누어떨어질 때만 바꾸나] 1500초는 "25분"이 되지만
      1700초는 "1700초"로 남는다. 어정쩡한 값을 "약 28분"으로 만들면 그 '약'이
      원장에 없는 새 수를 만든다 — 지금 고치는 바로 그 문제를 되풀이한다.
      DES 의 구간 경계는 60·900·1800·3600 처럼 사람 단위로 잡혀 있어서
      실제로는 거의 다 깔끔하게 떨어진다.
    """
    if unit != "초":
        return f"{v}{unit}"                 # 일 단위(재구매)는 이미 사람 단위다
    if v % 3600 == 0:
        return f"{v // 3600}시간"
    if v % 60 == 0:
        return f"{v // 60}분"
    return f"{v}초"                          # 안 떨어지면 원래 단위 그대로


def _curve_to_points(F, edges, unit: str) -> list[dict]:
    """구간별 누적확률 → 손님에게 보여줄 (시점, 확률) 목록.

    **곡선을 그대로 넘긴다.** 여기서 "15분"이라고 한 점을 고르지 않는다 —
    그건 발화의 일이고, 손님 사정에 따라 읽을 지점이 다르다(이론교재 4-01의
    비용 비대칭). 도구는 재료를 주고 판단을 넘긴다.

    ⚠ 0%·100%로 반올림하지 않는다. B의 관측 ②가 지적한 자리다 —
      `0%`는 "절대 안 온다"로, `100%`는 "확실하다"로 읽혀 **확률이 단정이 된다.**
    """
    out = []
    for i, f in enumerate(F):
        hi = edges[i + 1]
        if not np.isfinite(hi):
            break
        pct = float(f) * 100
        # ⚠ 칸 이름이 `prob` 였다 (08-27 정정). 값은 **퍼센트**(0.4 = 0.4%)인데
        #   이름이 확률이라, 모델이 "0.4 → 40%"로 읽고 손님에게 **100배 틀린 수**를
        #   말했다("30분 내는 40% 정도고" — 실제로는 0.4%). 가드는 못 잡는다:
        #   40 이 원장 어딘가에 있으면 "근거 있는 수"로 통과하고, 애초에 가드는
        #   **수가 원장에 있나**를 보지 **그 수가 무엇의 값인가**를 안 본다.
        #   골든셋도 PASS 를 줬다 — "%가 있는가"만 봤으니까.
        # [교훈] 스키마의 이름은 주석이 아니라 **인터페이스**다. 단위가 이름에 없으면
        #   읽는 쪽이 단위를 추측하고, LLM 은 가장 흔한 관행(0~1 확률)으로 추측한다.
        #   `_pct` 접미사는 그 추측의 여지를 없앤다.
        out.append({"within": _humanize(int(hi), unit),
                    "prob_pct": round(pct, 1),
                    # 0.05% 미만·99.95% 초과는 그 사실을 문자로 적어 둔다
                    "note": ("거의 없음" if pct < 0.05 else
                             ("거의 확실" if pct > 99.95 else None))})
    return out


# ── ① 가용예측 ──────────────────────────────────────────────────────────────
def predict_availability(sku_id: int) -> dict:
    """매대가 언제 채워지나 — 시점별 확률 곡선.

    ⚠ **지금은 설 수 없다.** 모델이 요구하는 큐 상태(매장 전체에서 par 밑인 SKU가
      몇 건이고 그 경로 구성이 어떤가)를 줄 창구가 SoT에 없다.
      `get_inventory`는 SKU 하나만 보고, qlen은 **매장 단위 집계**다.

      큐 없이 돌리면 얼마나 나빠지는지 쟀다(08-25):
          전체(83열)      Brier 0.04064
          큐 5칸 제거(78) Brier 0.07507   ← 85% 악화. 규칙 바닥(0.1248)에 가까워진다
      **큐가 이 자산의 절반이다.** 중앙값으로 채워 넣으면 "그럴듯한 거짓"이 된다.

    → 그 창구가 요청 ③이고 08-27에 열렸다(구현 확인):
          GET /internal/replenishment/pending
          → [{sku_id, location_id, floor, has_bulk, queued_at}, …]
      그것만 있으면 qlen·q_vertical·q_horizontal·q_work_sec를 전부 만들 수 있다.
    """
    b = _STATE["availability"]
    if b is None:                                              # (55)
        return {"error": "model_not_loaded",
                "message": "가용예측 모델이 적재되지 않았습니다."}

    pending = sot_client.get_pending_replenishments()
    # 큐를 못 얻은 이유가 셋이다. **발화 정책은 셋 다 같다**(시간을 지어내지
    # 않는다) — 다른 것은 `why` 뿐이고, 그게 운영자가 원인을 아는 유일한 단서다.
    # 08-27 B 검수: 전에는 셋을 전부 "창구가 아직 없습니다"로 접어, 키 오타
    # 하나에 자산이 통째로 침묵하는데 로그엔 "미구현"만 남았다.
    #   None            창구 없음(404)
    #   "auth_failed"   키·권한 — 우리 설정 문제
    #   "sot_unreachable" 백엔드 미기동·타임아웃
    _WHY = {None: "매장 전체 보충 대기 상태를 조회할 창구가 아직 없습니다.",
            "auth_failed": "백엔드 내부 API 인증에 실패했습니다(INTERNAL_SERVICE_KEY 불일치).",
            "sot_unreachable": "백엔드에 연결하지 못했습니다(미기동·타임아웃)."}
    if pending is None or isinstance(pending, str):
        return {"error": "queue_state_unavailable",
                "message": ("지금은 보충 시점을 확률로 말할 수 없습니다. "
                            "매대 재고와 예비 재고(BULK) 유무까지만 말하고, "
                            "'약 N분'처럼 시간을 지어내지 마세요."),
                "why": _WHY.get(pending, _WHY[None])}

    inv = sot_client.get_inventory(int(sku_id)) or {}
    locs = inv.get("locations") or []
    pick = next((L for L in locs if L.get("tier_role") == "PICK"), None)
    if pick is None:
        return {"error": "no_pick_location",
                "message": f"sku {sku_id}의 매대 위치를 못 찾았습니다."}

    mine = next((r for r in pending if int(r["sku_id"]) == int(sku_id)), None)
    if mine is None:
        # par 위에 있다 = 보충 대기가 아니다. 그러면 "언제 채워지나"가 성립 안 한다.
        return {"error": "not_pending",
                "message": ("이 상품은 지금 보충 대기 중이 아닙니다. "
                            "매대에 재고가 있으니 그대로 안내하세요."),
                "pick_qty": pick.get("qty")}

    # ── 큐 상태를 특징으로 바꾼다 ─────────────────────────────────────────
    # 학습 때 `mode1.py`가 적은 것과 **같은 정의**여야 한다:
    #   qlen        큐에 든 작업 수(자기 자신 포함)
    #   q_vertical  그중 BULK가 있어 수직 보충인 건수
    #   q_work_sec  예상 소요의 합 — E[하역]=K·θ 는 학습 상수라 여기선 근사한다
    # ⚠ q_work_sec의 이동시간은 실제 좌표가 필요한데 mock에는 층만 있다.
    #   같은 층이면 수직에 가깝다고 보고 상수를 쓴다 — **근사임을 결과에 적는다.**
    qlen = len(pending)
    q_vert = sum(1 for r in pending if r["has_bulk"])
    q_horiz = qlen - q_vert
    VERT_SEC, HORIZ_SEC = 130.0, 400.0     # 학습 세계의 대략적 평균 소요(초)
    q_work = q_vert * VERT_SEC + q_horiz * HORIZ_SEC

    now = config.DEMO_NOW
    path = "VERTICAL" if mine["has_bulk"] else (
        "HORIZONTAL" if mine.get("floor_no") == pick.get("floor_no") else "FLOOR")

    prod = sot_client.get_product(int(sku_id)) or {}
    l2 = prod.get("category_l2") or prod.get("l2")

    cols = [str(c) for c in b["cols"]]
    ip = {c: i for i, c in enumerate(cols)}
    n_bins = len(b["bin_edges"]) - 1
    x = np.zeros(len(cols), dtype=np.float32)

    def _put(name, val):
        if name in ip:
            x[ip[name]] = float(val)

    _put("qlen", qlen)
    _put("log_qlen", np.log1p(qlen))
    _put("q_vertical", q_vert)
    _put("q_horizontal", q_horiz)
    _put("log_q_work", np.log1p(q_work))
    # ── 매대 거리 (08-26 — R 검증 B-5가 찾은 누락 특징) ──────────────────
    # 같은 경로유형 안에서도 매대가 입고구에서 먼 SKU는 이동이 ±27초씩 다르다.
    # 번들의 (sku, path) 표에서 읽는다 — 학습 세계의 기하량이고, 실물 배포에선
    # 백엔드 locations 좌표에서 같은 값이 나온다. 표에 없는 SKU(신상품 등)는
    # 경로유형 평균으로 받는다 — 0으로 두면 "거리 0인 매대"라는 거짓이 된다.
    tv = b.get("travel", {}).get((int(sku_id), path))
    if tv is None:
        tv = b.get("travel_mean", {}).get(path, 0.0)
    _put("log_travel", np.log1p(tv))
    ang_h = 2 * np.pi * now.hour / 24.0
    ang_d = 2 * np.pi * now.weekday() / 7.0
    _put("hour_sin", np.sin(ang_h)); _put("hour_cos", np.cos(ang_h))
    _put("dow_sin", np.sin(ang_d));  _put("dow_cos", np.cos(ang_d))
    _put(f"path_type={path}", 1.0)
    if l2:
        _put(f"l2={l2}", 1.0)

    # 구간 더미만 갈아 끼우며 h(t)를 뽑고 누적한다 — 도구가 낼 곡선.
    rows = np.tile(x, (n_bins, 1))
    rows[:, :n_bins] = np.eye(n_bins, dtype=np.float32)
    h = b["model"].predict_proba(rows)[:, 1]
    F = 1.0 - np.cumprod(1.0 - h)

    return {
        "sku_id": int(sku_id),
        "pick_qty": pick.get("qty"),
        "has_bulk": bool(mine["has_bulk"]),
        "path_type": path,
        "queue_len": qlen,
        "curve": _curve_to_points(F, list(b["bin_edges"]), "초"),
        "read_as": ("곡선은 '그 시점까지 보충이 끝날 확률'입니다. 한 점을 골라 "
                    "'약 N분'으로 단정하지 말고 확률과 함께 말하세요. "
                    "⚠ 큐의 예상 작업량은 근사값입니다(이동시간을 상수로 봅니다)."),
    }


# ── ② 소비주기 ──────────────────────────────────────────────────────────────
def _repurchase_one(sku_id: int, hist: list | None = None) -> dict:
    """이 손님이 이 상품을 다시 살 때가 됐나 — 시점별 확률 곡선. **품목 하나.**

    ⚠ 이것은 내부 함수다. LLM 이 부르는 도구는 아래 `predict_repurchase`(복수)다.
      `hist` 를 받는 이유: 복수판이 이력을 **한 번만** 조회해 나눠 주기 위함이다.
      품목마다 다시 조회하면 같은 회원의 같은 이력을 N 번 가져온다.

    가용예측과 달리 **필요한 것이 전부 SoT에 있다** — 그 쌍의 과거 구매 이력이면
    된다. 회원 번호는 LLM이 아니라 루프가 주입한 것을 쓴다(B안).
    """
    from app.tools import query                                # 순환 import 회피
    b = _STATE["repurchase"]
    if b is None:
        return {"error": "model_not_loaded",
                "message": "소비주기 모델이 적재되지 않았습니다."}

    member_id = query.current_member_id()
    if member_id is None:
        return {"error": "no_member",
                "message": "비회원 세션이라 구매 이력이 없습니다. 로그인하면 "
                           "재구매 시점을 안내할 수 있다고 알려주세요."}

    if hist is None:
        hist = sot_client.get_purchase_history(member_id) or []
    days = sorted(_to_day(h["purchased_at"]) for h in hist
                  if int(h.get("sku_id", -1)) == int(sku_id))
    if not days:
        return {"error": "no_history",
                "message": f"이 손님이 sku {sku_id}를 산 기록이 없습니다. "
                           "재구매 시점을 말하지 말고, 처음 사는 상품으로 다루세요."}

    # 마지막 구매로부터 며칠 지났나 — 이것이 곡선을 읽는 x축의 원점이다.
    now = _to_day(config.DEMO_NOW.isoformat())
    elapsed = now - days[-1]

    # 과거 간격의 로그평균(past_log_mean)·개수(past_n) — 학습 때와 같은 정의.
    # ⚠ **완료된 간격만** 센다. 마지막 구매~지금은 아직 안 끝난 간격이라 빼야 한다.
    #   넣으면 "짧은 간격"으로 오해되어 주기를 실제보다 짧게 만든다.
    gaps = [days[i + 1] - days[i] for i in range(len(days) - 1) if days[i + 1] > days[i]]
    past_n = len(gaps)
    past_log_mean = float(np.mean(np.log(gaps))) if gaps else 0.0

    prod = sot_client.get_product(sku_id) or {}
    l2 = prod.get("category_l2") or prod.get("l2")

    # ── 두 모델 중 무엇을 쓰나 — 접점이 다르면 질문이 다르다 ──────────────
    # B가 둘을 낸 이유가 이것이다(2-07):
    #   unconditional  전 구간 학습. **매장 밖**(푸시) — "곧 살 때 됩니다"
    #   conditional    방문이 있었던 구간만. **매장 안**(진입 브리핑) —
    #                  손님이 이미 왔으므로 P(그날 방문) 항이 1이다
    # 실측으로 둘이 1.3~2.4배 다르다. 세션이 있으면 손님은 지금 매장에 있다 —
    # 그 신호가 곧 접점이다.
    from app.tools import query as _q
    model_key = "conditional" if _q.current_session_id() else "unconditional"

    # eb = 과거 로그평균(원시 a). 이력이 없으면 그 소분류의 사전평균으로 대체한다
    # — 콜드스타트에서 0을 넣으면 "주기 1일"이 되어 매번 알리게 된다.
    l2_names = [str(x) for x in b.get("l2_names", [])]
    if past_n > 0:
        eb = past_log_mean
    elif l2 in l2_names:
        eb = float(b["mu_l2"][l2_names.index(l2)])
    else:
        eb = float(b["gm"])

    F = _repurchase_curve(b, model_key, l2=l2, past_n=past_n, eb=eb, qty=1.0)
    if F is None:
        return {"error": "feature_mismatch",
                "message": "출하본의 특징 구성이 지금 카탈로그와 안 맞습니다.",
                "hint": "models/repurchase_ship.py 로 재학습이 필요합니다."}

    edges = list(b["bin_edges"])
    pts = _curve_to_points(F, edges, "일")
    # 경과일이 이미 지난 구간은 손님에게 의미가 없다 — 앞으로의 구간만 남긴다.
    fut = [p for p, hi in zip(pts, edges[1:]) if hi > elapsed]

    # ── 이득의 창 (08-26 · R 검증 A-5의 【정책】 반영) ────────────────────
    # 시평별 IPCW 채점 결과: 개인화 이득은 10~47일 창에 몰려 있고, 90일 넘는
    # 시평에서 이 모델은 **전체 평균(널)과 구분되지 않는다**(90일 Brier
    # 0.0252 vs 널 0.0259 · 130일은 널이 오히려 낫다). 즉 "당신은 90일 안에
    # 99.5%"는 개인화된 문장처럼 들리지만 정보량이 0이다.
    # 곡선을 자르지는 않는다 — 자르면 "그 뒤는 모른다"로 읽힌다. 점에 사실을
    # 달아 발화가 스스로 조심하게 한다(확률 반올림 note와 같은 계열).
    # 90일 지점 자체가 이미 구분 불가(0.0252 vs 널 0.0259)라 경계에 포함한다.
    HORIZON_LIMIT = 90.0
    for p, hi in zip(pts, edges[1:]):
        if np.isfinite(hi) and hi >= HORIZON_LIMIT:
            p["note"] = ((p.get("note") + " · " if p.get("note") else "")
                         + "개인화 정보 없음 — 전체 평균 수준")

    return {
        "sku_id": int(sku_id),
        "days_since_last": round(float(elapsed), 1),
        "past_intervals": past_n,
        "typical_cycle_days": (round(float(np.exp(past_log_mean)), 1)
                               if past_n else None),
        "curve": fut or pts[-1:],
        "model": model_key,
        # ⚠ "지금 사야 한다"고 단정하지 않는다. 판단 재료만 준다.
        "read_as": ("곡선은 '그 시점까지 다시 살 확률'입니다. 확률만 말하고 "
                    "'지금 사세요'로 단정하지 마세요. 과거 간격이 적으면"
                    "(past_intervals가 0~1) 그 사실을 함께 알리세요. "
                    "⚠ 90일부터의 확률은 개인화 정보가 없습니다(전체 평균과 "
                    "구분 안 됨 — 검증 실측). 그 구간을 '당신은'으로 시작하는 "
                    "문장이나 알림의 근거로 쓰지 마세요. "
                    "⚠ 회원 축(가구·반려·자녀·차량)과 방문 리듬은 지금 조회 창구가 "
                    "없어 결측·평균으로 채웠습니다 — 개인화가 덜 된 값입니다."),
    }


# 한 번에 돌려줄 최대 품목 수. "뭐 사야 되지?"의 답으로 스무 개를 늘어놓으면
# 손님이 아무것도 안 고른다 — 발화가 감당할 수 있는 길이가 곧 상한이다.
# ⚠ 자른 개수는 반드시 결과에 적는다(no silent caps, 08-24 검수).
REPURCHASE_MAX_ITEMS = 5


def predict_repurchase(sku_ids: list | None = None) -> dict:
    """살 때가 된 품목들 — **여러 개를 한 번에** 판정한다.

    [왜 복수인가 — 08-27에 서명이 스키마와 어긋나 있었다]
      스키마는 처음부터 `sku_ids`(배열, 비우면 전 품목)를 광고했는데 구현은
      `predict_repurchase(sku_id)` 단수였다. `schema_check.py` 가 이것을 잡았다.
      **스키마를 단수로 낮추는 선택지도 있었지만 그러면 기능이 사라진다** —
      도구 설명문에 적힌 "'뭐 사야 되지?'·살 때가 된 품목 선별"은 전 품목을
      훑어야만 답할 수 있고, 진입 브리핑(킬링 장면 3)의 "살 때 되신 것 2개"도
      마찬가지다. 어긋남을 발견했을 때 **구현이 게으른 쪽이었지 스키마가 과한
      쪽이 아니었다.**

    [sku_ids 를 비우면] 이 손님이 **2회 이상 산 품목 전부**를 판정한다.
      1회뿐인 품목은 간격이 없어 주기가 정의되지 않으므로 애초에 제외한다
      (넣으면 사전평균으로 곡선이 나오는데, 그건 개인화가 아니라 소분류 평균이라
      "당신은"으로 시작하는 문장의 근거가 못 된다).

    [정렬 — 무엇이 '더 살 때'인가] 경과일 ÷ 평소 주기. 이 비가 1을 넘으면
      평소보다 오래 안 산 것이다. 절대 경과일로 줄 세우면 원래 주기가 긴 품목
      (세제·휴지)이 늘 위로 올라와 매번 같은 답이 된다.
    """
    from app.tools import query                                # 순환 import 회피
    if _STATE["repurchase"] is None:
        return {"error": "model_not_loaded",
                "message": "소비주기 모델이 적재되지 않았습니다."}
    member_id = query.current_member_id()
    if member_id is None:
        return {"error": "no_member",
                "message": "비회원 세션이라 구매 이력이 없습니다. 로그인하면 "
                           "재구매 시점을 안내할 수 있다고 알려주세요."}

    hist = sot_client.get_purchase_history(member_id) or []
    if sku_ids:
        targets = list(dict.fromkeys(int(s) for s in sku_ids))
    else:
        # 이력 전 품목 — 단, 2회 이상 산 것만(위 독스트링)
        cnt = {}
        for h in hist:
            cnt[int(h["sku_id"])] = cnt.get(int(h["sku_id"]), 0) + 1
        targets = [s for s, n in cnt.items() if n >= 2]
        if not targets:
            return {"error": "no_history",
                    "message": "두 번 이상 산 품목이 없어 소비주기를 낼 수 없습니다. "
                               "재구매 시점을 말하지 말고 다른 방식으로 도우세요.",
                    "member_history_items": len(cnt)}

    results, failed = [], []
    for sku in targets:
        r = _repurchase_one(sku, hist=hist)
        (failed if r.get("error") else results).append(
            {"sku_id": sku, "error": r["error"]} if r.get("error") else r)

    # 살 때가 된 순서로. 주기를 못 구한 것(past_intervals=0)은 뒤로 민다.
    def _due(r):
        cyc = r.get("typical_cycle_days")
        return (r["days_since_last"] / cyc) if cyc else -1.0
    results.sort(key=_due, reverse=True)
    shown = results[:REPURCHASE_MAX_ITEMS]

    return {
        "member_id": member_id,
        "evaluated": len(targets),
        "returned": len(shown),
        # 자른 사실을 명시한다 — 없으면 LLM 이 "전부 검토했다"고 말하게 된다
        "truncated": len(results) - len(shown),
        "items": shown,
        "failed": failed,
        "read_as": ("items 는 **살 때가 된 순서**(경과일÷평소 주기)로 정렬돼 "
                    "있습니다. 각 항목의 curve·read_as 를 그대로 따르세요. "
                    "truncated 가 0 보다 크면 그만큼 더 있다는 사실을 알리세요."),
    }


def _to_day(ts: str) -> float:
    """ISO 시각 → 일 단위 실수(ordinal + 하루 중 비율). 학습 때와 같은 정의."""
    s = str(ts).replace("Z", "").replace("T", " ").strip()
    for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            d = datetime.strptime(s[:26], fmt)
            return d.toordinal() + (d.hour * 3600 + d.minute * 60 + d.second) / 86400.0
        except ValueError:
            continue
    raise ValueError(f"시각을 못 읽었습니다: {ts}")


def _repurchase_curve(b, model_key, l2, past_n, eb, qty):
    """출하본으로 구간 곡선 하나. 특징 구성이 안 맞으면 None.

    ⚠ **이름으로 채운다. 위치로 채우지 않는다.** 카탈로그가 바뀌어 열이 밀리면
      위치 기반 코드는 조용히 다른 값을 넣는다(가용예측 `cols` 대조와 같은 계열).

    ⚠ 내가 처음 쓸 때 이름을 **전부 틀렸다** — `past_n`·`past_log_mean`·`qty`·`l2`로
      추측했는데 실제는 `log_past_n`·`eb`·`log_qty`·`l2_code`였고, 모델도 하나가
      아니라 **둘**(unconditional·conditional)이었다. 모르는 이름은 0.0으로 채워져
      **예외 없이 엉뚱한 곡선**이 나왔을 것이다. 그래서 아래 `_need`가 있다 —
      기대한 이름이 없으면 조용히 넘어가지 않고 None을 돌려준다.
    """
    names = [str(x) for x in b.get("feature_names", [])]
    models = b.get("models") or {}
    model = models.get(model_key)
    if not names or model is None:
        return None
    # 이 셋이 없으면 우리가 아는 스키마가 아니다 — 추측으로 채우지 않는다.
    _need = {"bin", "l2_code", "eb"}
    if not _need <= set(names):
        return None

    l2_names = [str(x) for x in b.get("l2_names", [])]
    n_bins = len(b["bin_edges"]) - 1

    row = {n: 0.0 for n in names}
    row["eb"] = float(eb)
    if "log_past_n" in row:
        row["log_past_n"] = float(np.log1p(past_n))
    if "has_hist" in row:
        row["has_hist"] = 1.0 if past_n > 0 else 0.0
    if "log_qty" in row:
        row["log_qty"] = float(np.log1p(qty))
    # 소분류는 **코드**다. 목록에 없으면 -1(모름) — 0으로 두면 0번 소분류가 된다.
    row["l2_code"] = float(l2_names.index(l2)) if l2 in l2_names else -1.0
    # 회원 축 넷은 지금 SoT에서 안 온다 → 결측 표시자를 켠다(학습 때와 같은 규약).
    for ax in ("hh", "pet", "child", "car"):
        if f"{ax}_na" in row:
            row[f"{ax}_na"] = 1.0
    # 방문 리듬 둘(B의 repurchase_visits)도 SoT에 창구가 없다. 0으로 두면
    # "방문한 적 없음"이 되어 확률을 눌러 버린다 → **모집단 평균**으로 채운다.
    #   ⚠ 근사다. 이 사실을 결과의 read_as에 적는다.
    if "visit_rate" in row:
        row["visit_rate"] = float(b.get("visit_rate_mean", 0.18))
    if "log_visits_before" in row:
        row["log_visits_before"] = float(np.log1p(b.get("visits_before_mean", 12.0)))

    X = np.zeros((n_bins, len(names)), dtype=np.float32)
    for k, n in enumerate(names):
        X[:, k] = row[n]
    X[:, names.index("bin")] = np.arange(n_bins, dtype=np.float32)

    h = model.predict_proba(X)[:, 1]
    return 1.0 - np.cumprod(1.0 - h)


# ── ③ 사진 분석 ─────────────────────────────────────────────────────────────
def identify_product_photo(image_ref: str) -> dict:
    """사진과 닮은 상품 **후보 목록**과 tier. 무엇인지 판정하지 않는다.

    계약 전문은 `모델비교/T9_임베딩모델_비교.md` §9.5, 발화 규칙은 definitions의
    description. 여기서는 **tier만 정확히 계산**해 넘긴다.
    """
    b = _STATE["photo"]
    if b is None:
        return {"error": "model_not_loaded",
                "message": "사진 갤러리가 적재되지 않았습니다."}
    if _STATE["photo_encoder"] is None:
        return {"error": "encoder_not_loaded",
                "message": ("사진 인식 기능이 이 서버에 켜져 있지 않습니다. "
                            "상품명을 말씀해 주시면 찾아드린다고 안내하세요.")}

    img = _fetch_image(image_ref)
    if img is None:
        return {"error": "image_not_found",
                "message": f"이미지를 못 읽었습니다({image_ref})."}

    model, proc, dev = _STATE["photo_encoder"]
    import torch
    with torch.no_grad():
        inp = proc(images=[img], return_tensors="pt").to(dev)
        f = model.get_image_features(**inp)
        f = f if not hasattr(f, "pooler_output") else f.pooler_output
        q = (f / f.norm(dim=-1, keepdim=True)).cpu().float().numpy()[0]

    return _photo_search(b, q)


def _majority(labels, scores):
    """최빈 라벨. **동점은 점수 합으로 깬다** — 08-26 정정.

    원래는 `max(set(l2s), key=l2s.count)` 였다. 파이썬은 문자열 해시를
    **무작위화**하므로 `set` 순회 순서가 프로세스마다 다르고, `max`는 동점 중
    먼저 만난 것을 돌려준다 → **같은 사진이 서버를 재시작하면 다른 소분류가 된다.**
    실측: `['A','A','B','B','C']` 를 5개 프로세스에서 → `B B B A A`.

    같은 표를 받았으면 **더 가까운 쪽이 이긴다.** 표는 순위를 세는 것이고 점수는
    그 순위를 만든 값이니, 표가 비겼을 때 원래 값으로 돌아가는 셈이다.
    점수 합까지 같으면 사전순으로 못 박는다 — "거의 안 난다"를 비결정성의
    근거로 삼지 않는다.

    ⚠ `photo_ship._majority`와 **같은 규칙**이다. 둘이 어긋나면 학습 때 잰 정확도와
      서빙이 내는 답이 달라진다(이 파일 머리의 중복 경고와 같은 계열).
    """
    from collections import Counter
    cnt = Counter(labels)
    top = max(cnt.values())
    cand = sorted(l for l, n in cnt.items() if n == top)
    if len(cand) == 1:
        return cand[0]
    arr = np.asarray(labels)
    ssum = {l: float(np.asarray(scores)[arr == l].sum()) for l in cand}
    return max(cand, key=lambda l: (ssum[l], l))


def _photo_search(b, q: np.ndarray) -> dict:
    """쿼리 임베딩 → tier + 후보. photo_ship.search와 **같은 규칙**이다.

    ⚠ 규칙을 두 곳에 적은 셈이라 어긋날 수 있다. 그래서 임계값 자체는 번들에서
      읽는다 — 숫자를 여기 박아 두면 재학습으로 임계가 바뀌어도 서빙이 옛 값을 쓴다.
    """
    sim = np.asarray(b["emb"], dtype=np.float32) @ q

    # ── 허브성 보정 (CSLS) — 08-26 ──────────────────────────────────────
    # `2·cos − r_g`. r_g는 갤러리 행이 **얼마나 중심적인가**로, 빌드 때 재서
    # 번들에 실려 온다(임계를 번들에서 읽는 것과 같은 이유 — 숫자를 여기 박으면
    # 재생성해도 서빙이 옛 값을 쓴다). 여기서 하는 일은 **뺄셈 한 번**이다.
    #
    # 왜 필요한가: 고차원 최근접이웃 검색은 **허브**를 만든다 — 어떤 행이 질의와
    # 특별히 닮아서가 아니라 공간의 중앙에 있어서 자꾸 뽑힌다. 실측에서 종이컵·
    # 식빵·참치캔·화장지가 전부 「계란·알류」로 갔다(실물 64장 중 13장).
    # 보정 후 그 쏠림이 0이 되고 2단 소분류가 59.0% → 75.5%가 됐다.
    score = 2.0 * sim - np.asarray(b["hub_r"], dtype=np.float32)
    order = np.argsort(-score)

    k = int(b["purity_k"])
    l2s = [str(b["l2"][i]) for i in order[:k]]
    pick = _majority(l2s, score[order[:k]])
    purity = l2s.count(pick) / float(k)

    ik = int(b["item_k"])
    its = [str(b["item"][i]) for i in order[:ik]]
    item_purity = max(its.count(x) for x in set(its)) / float(ik)

    if purity < float(b["category_min"]):
        tier = "unsure"
    elif (item_purity >= float(b["item_min"])
          and purity >= float(b["confident_cat_min"])):
        tier = "confident"
    else:
        tier = "category"

    top = order[:int(b["top_n"])]
    cands = [{"sku_id": int(b["sku"][i]), "item": str(b["item"][i]),
              "name": str(b["name"][i]), "l2": str(b["l2"][i])} for i in top]
    # ⚠ 유사도·점수는 **손님에게 안 나간다.** T9 §9.1 — 유사도는 정답 여부와
    #   무관하므로(AUC 0.465) 숫자를 보여주면 근거 없는 확신을 준다.
    #   확신은 tier와 순도로만 말한다.

    # 후보의 **실물 가격·재고는 조회 도구로** 다시 확인해야 한다(출처 원장).
    return {
        "tier": tier,
        "l2": None if tier == "unsure" else pick,
        "category_confidence": round(float(purity), 3),
        "item_confidence": round(float(item_purity), 3),
        "candidates": cands,
        "read_as": ("tier가 어투를 정합니다. unsure에서 '매장에 없습니다'라고 "
                    "말하면 안 됩니다 — 못 찾은 것은 사진 판정이지 재고가 아닙니다. "
                    "후보의 가격·재고는 조회 도구로 다시 확인하세요."),
    }


def _fetch_image(image_ref: str):
    """업로드된 이미지를 연다. 지금은 로컬 경로만 — 릴레이 계약이 정해지면 교체한다."""
    from PIL import Image
    if os.path.exists(image_ref):
        return Image.open(image_ref).convert("RGB")
    return None


# ── ④⑤ 아직 자산이 없는 둘 ─────────────────────────────────────────────────
def get_position() -> dict:
    """위치 추정. **자산이 아직 없다**(규칙판: 스캔 앵커 + 보행 그래프 스냅).

    ⚠ 경로 도구는 이 도구를 안 기다린다 — 루프가 현재 위치를 주입하므로
      `optimize_route`는 여기 없이도 돈다(compute.set_position).
    """
    from app.tools import compute
    pos = compute.current_position()
    if pos is None:
        return {"error": "not_implemented",
                "message": ("지금 위치를 알 수 없습니다. 손님에게 몇 층인지 "
                            "물어보거나 위치 없이 답할 수 있는 부분만 답하세요.")}
    f, x, y = pos
    return {"floor_no": f, "x": x, "y": y,
            "source": "last_scan",
            "read_as": "마지막 스캔 위치입니다. 추정이라 정확하지 않을 수 있습니다."}


def match_preferences(**kwargs) -> dict:
    """취향 매칭. 자산 미구현."""
    return {"error": "not_implemented",
            "message": "취향 매칭은 아직 준비 중입니다. 이 기능 없이 답할 수 "
                       "있는 부분만 답하세요."}


REGISTRY = {
    "predict_availability": predict_availability,
    "predict_repurchase": predict_repurchase,
    "identify_product_photo": identify_product_photo,
    "get_position": get_position,
    "match_preferences": match_preferences,
}


def run(tool_name: str, tool_input: dict) -> dict:
    """도구 하나를 실행한다. 예외는 여기서 흡수한다 — 루프가 안 죽어야 한다."""
    fn = REGISTRY.get(tool_name)
    if fn is None:
        return {"error": "unknown_tool", "message": tool_name}
    try:
        return fn(**tool_input)
    except TypeError as e:
        return {"error": "bad_arguments", "message": str(e)}
    except Exception as e:                                     # noqa: BLE001
        return {"error": "infer_failed", "message": f"{type(e).__name__}: {e}"}
