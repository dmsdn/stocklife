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
# 09-05. 이름 붙이기는 **도구층에 하나만** 둔다 — 여기 복제하면 두 벌이 되고
# 언젠가 한쪽만 고쳐진다(`query._with_names` 독스트링의 판단과 같은 자리).
# ⚠ 방향은 한쪽뿐이다: query 는 infer 를 안 부른다(순환 없음).
from app.tools.query import _name_of, _with_names

_HERE = os.path.dirname(os.path.abspath(__file__))
ARTIFACTS = os.path.abspath(os.path.join(_HERE, "..", "artifacts"))

# (52) 모듈 전역 — lifespan이 채우고 도구가 읽는다. None이면 "아직 안 올렸다".
# floormap은 joblib이 아니라 **백엔드에서 받아 오는** 자산이다(위치추정 규칙판의
# 스냅 재료). 파일이 아니라도 "상주시키고 도구가 읽는다"는 계약은 같다.
_STATE: dict = {"availability": None, "repurchase": None,
                "photo": None, "photo_encoder": None, "floormap": None,
                "preference": None,
                "facilities": None}     # 09-03: {층: {종류: [블록, …]}} — find_facility 의 재료


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

    def _load_preference():
        """취향 매칭 출하물 + **요청마다 안 변하는 것을 여기서 미리 굽는다.**

        [무엇을 미리 굽나] 소분류 안의 인기 순위 g 와 그것을 cap 으로 끊은 blk.
          둘 다 회원과 무관하다 — 회원이 바뀌어도 "우유 소분류에서 3번째로 잘
          팔리는 것"은 그대로다. 요청마다 다시 세면 5,000개 정렬을 매번 돈다.

        [g 를 어떻게 세나 — lexsort 의 키 순서에 주의]
          `np.lexsort((-pop_n, l2))` 는 **마지막 키가 1순위**다. 즉 소분류로
          먼저 묶고 그 안에서 인기 내림차순. 순서를 뒤집으면 소분류가 섞여
          "소분류당 몇 개"라는 다양화 자체가 성립하지 않는다.
        """
        z = np.load(os.path.join(ARTIFACTS, "preference_model.npz"),
                    allow_pickle=True)
        b = {k: z[k] for k in z.files}
        b["l2_names"] = [str(n) for n in b["l2_names"]]
        b["alpha"] = float(b["alpha"])
        b["axis_mult"] = float(b["axis_mult"])
        b["div_cap"] = int(b["div_cap"])
        b["version"] = str(b["version"])
        b["method"] = str(b["method"])

        l2 = b["l2_of_sku"].astype(np.int64)
        b["l2_of_sku"] = l2
        S = len(l2)
        pop = b["pop"].astype(np.float64)
        pop_n = pop / (pop.max() + 1.0)                        # [0, 1)
        ordv = np.lexsort((-pop_n, l2))                        # 소분류별 인기순
        g = np.empty(S, np.int64)
        _, cuts = np.unique(l2[ordv], return_index=True)
        # 각 소분류의 시작 위치를 그 소분류 길이만큼 늘려 빼면, 전체 순위가
        # **소분류 안에서 0부터 세는 순위**로 바뀐다.
        g[ordv] = np.arange(S) - np.repeat(cuts, np.diff(np.r_[cuts, S]))
        b["g"] = g
        b["blk"] = (g // b["div_cap"]).astype(np.float64)
        b["sku_ix"] = {int(v): i for i, v in enumerate(b["sku"])}
        _STATE["preference"] = b
        return f'{b["version"]} ({S:,} SKU · 소분류 {len(b["l2_names"])})'

    if os.path.exists(os.path.join(ARTIFACTS, "preference_model.npz")):
        _try("preference", _load_preference)

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

    # 위치추정의 스냅 재료 — 실물 모드에서만(백엔드가 격자의 정본이다).
    # 백엔드가 아직 안 떠 있으면 여기서 실패해도 되고(_try가 삼킨다),
    # 첫 사용 시 _ensure_floormap()이 다시 시도한다 — 기동 순서에 안 묶인다.
    if not config.USE_MOCK_SOT:
        _try("floormap", _load_floormap)

    return got


def _load_floormap() -> str:
    """보행 격자를 백엔드에서 받아 상주시킨다 — 위치추정 자산의 적재.

    층당 7,125칸(95×75)을 매 요청마다 받으면 그게 병목이라, joblib 자산들과
    같은 규율(헌법 6 — lifespan 1회 로드 상주)로 여기서 한 번 받는다.
    담는 것은 층별 **통행 가능 칸의 집합** 하나다 — 스냅에 필요한 것은
    "이 칸을 밟을 수 있나"라는 판정뿐이고, set의 in 검사는 O(1)이다.
    """
    fm = {}
    facilities: dict = {}                # 층 → [{"location_id","kind","label","x","y","floor_no"}]
    for f in (1, 2, 3):
        m = sot_client.get_floor_map(f)
        cells = (m or {}).get("cells") or []
        if not cells:
            raise RuntimeError(f"{f}층 격자가 비어 있습니다 — nav_cells 시드 확인")
        fm[f] = frozenset((int(c["x"]), int(c["y"])) for c in cells
                          if c.get("passable"))
        # 09-03: 시설은 이제 `locations` 의 행이다(tier_role=FACILITY, id 'F1-X-RESTROOM_M-1').
        #   같은 창구(/api/map/floors/{n})의 `facilities` 목록으로 받는다 — 종류는 id 의
        #   셋째 조각. 옛 백엔드(칸 없음)면 비어 있고 find_facility 가 no_facility_map 을 낸다.
        for loc in (m or {}).get("facilities") or []:
            lid = str(loc.get("locationId") or "")
            parts = lid.split("-")
            if len(parts) < 4 or parts[1] != "X":
                continue
            kind = parts[2]
            facilities.setdefault(f, []).append({
                "location_id": lid, "kind": kind,
                "label": FACILITY_LABELS.get(kind, kind),
                "floor_no": f, "x": int(loc["x"]), "y": int(loc["y"])})
    _STATE["floormap"] = fm
    _STATE["facilities"] = facilities
    n_fac = sum(len(v) for v in facilities.values())
    return ("격자 " + " · ".join(f"{f}층 {len(s):,}칸" for f, s in fm.items())
            + f" · 시설 {n_fac}곳")


def _ensure_floormap() -> dict | None:
    """격자를 지연 확보한다 — lifespan 때 백엔드가 안 떠 있었어도 살아난다.

    기동 순서 문제는 08-27에 실제로 있었다(에이전트 먼저, 백엔드 나중).
    적재 실패를 영구 상태로 만들면 "백엔드를 늦게 켠 날"은 재기동 전까지
    스냅이 죽는다 — 그래서 None이면 쓸 때 한 번 더 시도한다.
    """
    if _STATE["floormap"] is None and not config.USE_MOCK_SOT:
        try:
            _load_floormap()
        except Exception:                                      # noqa: BLE001
            return None                # 여전히 못 받으면 스냅 없이 간다(앵커는 산다)
    return _STATE["floormap"]


def snap_to_walkable(floor: int, x: int, y: int, max_r: int = 4):
    """(floor, x, y)를 가장 가까운 통행 가능 칸으로 스냅한다.

    [왜 필요한가] 사람은 매대 위가 아니라 그 앞 통로에 서 있다. 통행 불가 칸을
    출발점으로 넘기면 백엔드 A*가 "출발점이 통행 불가"로 경로를 못 만든다.

    ⚠ **실측(08-27): 지금은 한 번도 안 옮긴다.** 실 시드의 위치 10,104개
    (PICK 5,052 · BULK 5,052)가 **전부 이미 통행 칸**이다 — `world_gen`이
    `FACE_D` 오프셋을 적용해 **접근 지점**을 `locations`에 넣기 때문이다.
    처음엔 "매대 칸이라 반드시 옮겨야 한다"고 적었는데 난수 격자로만 재서
    틀렸다(실데이터로 다시 재고 고쳤다).
    그래도 남기는 이유: 앵커의 출처가 `locations`만이 아니다 — 프론트가 보내는
    `posFloor/posX/posY`는 **스캔 시점의 기기 좌표**라 통행 칸 보장이 계약에
    없다. 비용 0의 안전망이고, 배치가 바뀌면 그날 값을 한다.
    **"없으면 죽는다"가 아니라 "지금은 무동작"이 정확한 서술이다.**

    [탐색] 반경 r=0,1,2,…의 정사각 링을 안쪽부터 돈다 — 처음 만나는 통행 칸이
    가장 가까운 답이다(체비셰프 거리 기준. 매대는 2×2라 r≤2에서 반드시 통로가
    나오고, max_r=4는 시설 언저리 좌표까지 감당하는 여유다).

    [반환] (x, y, snapped) — 격자가 없으면(모의 모드·백엔드 다운) 입력 그대로
    돌려주고 snapped=False. 스냅 실패도 좌표를 버리지 않는다 — 층 정보만으로도
    발화("2층에 계시죠")는 성립한다.
    """
    fm = _ensure_floormap()
    grid = (fm or {}).get(int(floor))
    if not grid:
        return int(x), int(y), False
    if (int(x), int(y)) in grid:
        return int(x), int(y), False               # 이미 통로 — 스냅할 것 없음
    for r in range(1, max_r + 1):
        best = None
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if max(abs(dx), abs(dy)) != r:     # 링의 테두리만 (안쪽은 이미 봤다)
                    continue
                c = (int(x) + dx, int(y) + dy)
                if c in grid:
                    # 같은 링 안에서는 맨해튼 거리로 더 가까운 쪽을 고른다 —
                    # 대각(2칸 걸음)보다 정면(1칸 걸음)이 실제로 가깝다.
                    d = abs(dx) + abs(dy)
                    if best is None or d < best[0]:
                        best = (d, c)
        if best is not None:
            return best[1][0], best[1][1], True
    return int(x), int(y), False                   # 반경 안에 통로가 없다 — 그대로


def _load_photo_encoder():
    """SigLIP2 이미지 인코더를 상주시킨다. **3.5GB짜리라 선택 적재다.**"""
    import torch                                               # (53)
    from transformers import AutoModel, AutoProcessor
    mid = _STATE["photo"]["model_id"]
    # config의 장치 계약을 따른다. CPU 모드는 사전학습 GPU와 메모리를 경쟁하지 않는다.
    # auto일 때만 가용 장치를 고른다. cuda를 명시했는데 없다면 적재 오류로 보고한다.
    requested = config.PHOTO_DEVICE
    dev = ("cuda" if torch.cuda.is_available() else "cpu") if requested == "auto" else requested
    model = AutoModel.from_pretrained(mid).to(dev).eval()
    proc = AutoProcessor.from_pretrained(mid)
    _STATE["photo_encoder"] = (model, proc, dev)


def loaded() -> dict:
    """무엇이 올라와 있나 — /health가 읽는다."""
    return {k: (v is not None) for k, v in _STATE.items()}


def photo_runtime() -> dict:
    """환경 설정이 아니라 실제 적재된 모델의 실행 장치를 보고한다."""
    encoder = _STATE.get("photo_encoder")
    return {"loaded": encoder is not None,
            "device": str(next(encoder[0].parameters()).device) if encoder else None}


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

    now = datetime.now() if config.LIVE_INFERENCE_CLOCK else config.DEMO_NOW
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
        # ⚠ 09-05 상류 감사. 여기에 이름이 없어서 **킬링 장면 1 의 헤드라인**
        #   ("약 15분 후 보충 예정")이 "sku 200032 는…" 으로 나갈 수 있었다.
        #   09-04 구매이력 사건과 같은 뿌리 — 모델은 받은 것 중에서만 말한다.
        "name": _name_of(int(sku_id)),
        "pick_qty": pick.get("qty"),
        "has_bulk": bool(mine["has_bulk"]),
        "path_type": path,
        "queue_len": qlen,
        "curve": _curve_to_points(F, list(b["bin_edges"]), "초"),
        # ⚠ 단위 함정을 **여기로 옮겼다**(㉠ 축약 08-29). 설명문에 있었는데,
        #   그건 곡선을 실제로 읽는 순간과 멀다. 값의 단위는 **값에 붙는 사실**
        #   이라 결과가 제자리다 — 그리고 여기 있으면 곡선을 보는 바로 그때 온다.
        "read_as": ("곡선은 '그 시점까지 보충이 끝날 확률'입니다. 한 점을 골라 "
                    "'약 N분'으로 단정하지 말고 확률과 함께 말하세요. "
                    "⚠ prob_pct 는 **이미 퍼센트**입니다(0.4 는 0.4% 이지 40% 가 "
                    "아닙니다). 100 을 곱하지 마세요. within 도 이미 사람 단위라 "
                    "초로 되돌리거나 다른 단위로 바꾸지 마세요. "
                    "⚠ 큐의 예상 작업량은 근사값입니다(이동시간을 상수로 봅니다)."),
    }


# ── ② 소비주기 ──────────────────────────────────────────────────────────────
def _repurchase_typical(b, sku_id, prod, l2, l2_names) -> dict:
    """**전형 주기** — 개인 이력이 없을 때. 조건부 확률이 아니다.

    [무엇이 다른가] 이력이 있는 곡선은 「그 사람이 다시 살 확률」이고, 이것은
      「이 상품군을 사는 사람들의 전형적인 주기」다. 수식은 같은 모델을 쓰지만
      **말할 수 있는 문장이 다르다** — 주어가 "손님"이 아니라 "보통".

    [왜 그래도 값어치가 있나] 처음 사는 상품에 대해 "모릅니다"밖에 못 하면
      진열대 앞에서 아무 도움이 안 된다. "이건 보통 3주쯤 쓰십니다"는
      개인화가 아니어도 재고·묶음 판단에 쓰인다.

    [무엇을 안 하나] 개인 축(가구·반려·자녀·차량)은 조회 창구가 없어 못 쓴다.
      그래서 이 값은 **소분류 수준**이고, 그 사실을 `basis` 와 `read_as` 에
      싣는다. 창구가 열리면 여기에 축을 넣어 "비슷한 가구의 분들은"까지 간다.
    """
    from app.tools import query as _q
    model_key = "conditional" if _q.current_session_id() else "unconditional"

    if l2 in l2_names:
        eb = float(b["mu_l2"][l2_names.index(l2)])
        basis = "l2_typical"
    else:
        eb = float(b["gm"])
        basis = "global_typical"          # 소분류를 모르면 전체 평균까지 내려간다

    F = _repurchase_curve(b, model_key, l2=l2, past_n=0, eb=eb, qty=1.0)
    if F is None:
        return {"error": "feature_mismatch",
                "message": "출하본의 특징 구성이 지금 카탈로그와 안 맞습니다."}

    edges = list(b["bin_edges"])
    pts = _curve_to_points(F, edges, "일")
    # 90일 넘는 구간은 개인화 여부와 무관하게 널과 구분되지 않는다(A-5).
    for p, hi in zip(pts, edges[1:]):
        if np.isfinite(hi) and hi >= 90.0:
            p["note"] = ((p.get("note") + " · " if p.get("note") else "")
                         + "전체 평균 수준")

    return {
        "sku_id": int(sku_id),
        "basis": basis,                    # ← 이력 기반과 가르는 칸
        "days_since_last": None,           # 산 적이 없다
        "past_intervals": 0,
        "typical_cycle_days": round(float(np.exp(eb)), 1),
        "l2": l2,
        "curve": pts,
        "model": model_key,
        "read_as": (
            "⚠ 이 손님은 이 상품을 **산 적이 없습니다.** 곡선과 주기는 "
            "'이 상품군을 사는 사람들의 전형'이지 이 손님의 예측이 아닙니다. "
            "'손님은 ~쯤 다시 사실 거예요'처럼 **주어를 손님으로 두지 마세요.** "
            "'이건 보통 N일쯤 쓰십니다' 정도가 말할 수 있는 전부입니다. "
            "먼저 사시는 상품이라는 사실을 숨기지 마세요. "
            "⚠ 개인 축(가구·반려·자녀)은 조회 창구가 없어 반영되지 않았습니다."),
    }


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

    prod = sot_client.get_product(sku_id) or {}
    l2 = prod.get("category_l2") or prod.get("l2")
    l2_names = [str(x) for x in b.get("l2_names", [])]

    if not days:
        # ── 콜드스타트 — 개인 이력이 없다 ────────────────────────────────
        # 08-28 까지 여기서 `no_history` 로 끊었다. 그런데 **모델은 이미
        # 된다**: 특징 구성이 `past_n == 0` 이면 소분류 사전평균으로 대체하게
        # 돼 있고(아래 eb), 출하물에 그 사전평균(`mu_l2`)이 들어 있다.
        # 끊고 있던 것은 모델의 한계가 아니라 분기 하나였다.
        #
        # ⚠ **그렇다고 같은 문장을 말하면 안 된다.** 이력이 있을 때의 곡선은
        #   "당신이 다시 살 확률"이고, 여기서 나오는 곡선은 "이 상품군의
        #   전형적인 주기"다. 주어가 다르다. 같은 모양으로 돌려주면 LLM 이
        #   "손님은 3주쯤 뒤에 다시 사실 거예요"라고 말한다 — **없는 개인화를
        #   지어내는 것**이고, 손님은 그걸 자기 얘기로 듣는다.
        #   그래서 `basis` 로 종류를 표시하고 `read_as` 로 주어를 못 박는다.
        return _repurchase_typical(b, sku_id, prod, l2, l2_names)

    # 마지막 구매로부터 며칠 지났나 — 이것이 곡선을 읽는 x축의 원점이다.
    from datetime import timezone
    now_at = datetime.now(timezone.utc) if config.LIVE_INFERENCE_CLOCK else config.DEMO_NOW
    now = _to_day(now_at.isoformat())
    elapsed = now - days[-1]

    # 과거 간격의 로그평균(past_log_mean)·개수(past_n) — 학습 때와 같은 정의.
    # ⚠ **완료된 간격만** 센다. 마지막 구매~지금은 아직 안 끝난 간격이라 빼야 한다.
    #   넣으면 "짧은 간격"으로 오해되어 주기를 실제보다 짧게 만든다.
    gaps = [days[i + 1] - days[i] for i in range(len(days) - 1) if days[i + 1] > days[i]]
    past_n = len(gaps)
    past_log_mean = float(np.mean(np.log(gaps))) if gaps else 0.0

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
    #
    # ⚠ **08-29 결함**: 가드가 `cyc` 만 봤는데, 08-28 에 콜드스타트 갈래를 열면서
    #   **`typical_cycle_days` 는 있고 `days_since_last` 는 None** 인 항목이
    #   생겼다(`_repurchase_typical` — 소분류 전형 주기는 아는데 이 손님이 산
    #   적은 없다). 그래서 `None / float` 로 터졌고, `loop._dispatch` 가 그것을
    #   `bad_arguments` 로 감싸 **인자는 멀쩡한데 인자 탓처럼 보였다.**
    #
    #   ⚠ 그리고 **한 항목이 터지면 그 호출 전체가 죽는다** — 정렬은 목록
    #   단위라 나머지 멀쩡한 항목까지 같이 사라진다.
    #
    #   [왜 아무도 못 봤나] 인자를 안 주는 갈래(`sku_ids=None`)는 대상을
    #   **두 번 이상 산 품목**에서 뽑으므로 전부 이력이 있다. 골든셋의
    #   `real_repurchase` 가 그 갈래라 늘 초록이었다. 터지는 것은 LLM 이
    #   `sku_ids` 를 **직접 지목**할 때뿐인데, 그건 도구 설명문이 권하는
    #   바로 그 용법이다("이거 또 살 때 됐나?").
    #
    #   [왜 뒤로 미나] 이 손님의 경과일이 없으니 "살 때가 됐다"의 순위를
    #   매길 근거가 없다. -1.0 은 "순위 밖"이라는 뜻이고, 콜드스타트 항목은
    #   목록에 남되 뒤에 선다 — **빼지 않는다**(빼면 손님이 물은 상품이
    #   답에서 조용히 사라진다).
    def _due(r):
        cyc = r.get("typical_cycle_days")
        since = r.get("days_since_last")
        return (since / cyc) if (cyc and since is not None) else -1.0
    results.sort(key=_due, reverse=True)
    shown = results[:REPURCHASE_MAX_ITEMS]

    return {
        # ⚠ 09-05 상류 감사 — `member_id` 를 안 싣는다. 모델이 쓸 일이 없고
        #   결과에 있으면 "회원 1001 님" 으로 읽힐 길만 생긴다. 규율로
        #   덮는 부류가 아니라 **안 보내는 것이 답인 부류**다.
        "evaluated": len(targets),
        "returned": len(shown),
        # 자른 사실을 명시한다 — 없으면 LLM 이 "전부 검토했다"고 말하게 된다
        "truncated": len(results) - len(shown),
        # ⚠ 09-05. `_with_names` 의 독스트링 ②가 *"infer.py 의 소비주기 추정도
        #   같은 이력을 쓰는데 거기엔 이름이 필요 없다"* 라고 적었는데 —
        #   **내부 추정에는 맞고 이 반환에는 틀렸다.** 이 items 가 곧 진입
        #   브리핑(킬링 장면 3)의 재료다. 사람이 읽는 자리다.
        "items": _with_names(shown),
        "failed": failed,
        "read_as": ("items 는 **살 때가 된 순서**(경과일÷평소 주기)로 정렬돼 "
                    "있습니다. 각 항목의 curve·read_as 를 그대로 따르세요. "
                    "truncated 가 0 보다 크면 그만큼 더 있다는 사실을 알리세요. "
                    # 09-05: 골든 실호출에서 주기·확률은 다 맞는데 **어느 상품
                    # 이야기인지 한 번도 안 밝힌** 발화가 나왔다. 1턴이면
                    # 손님이 방금 말했으니 통하지만, 여러 상품을 받은 판이나
                    # 진입 브리핑에서는 **손님이 무엇의 이야기인지 모른다.**
                    # ⚠ 09-05 에 이 items 에 name 을 붙였다 — 이제 말할 수 있다.
                    "⚠ **어느 상품에 대한 답인지 name(상품명)으로 밝히세요.** "
                    "주기·확률만 말하면 손님은 무엇의 이야기인지 모릅니다."),
    }


def _to_day(ts: str) -> float:
    """ISO 시각 → 일 단위 실수(ordinal + 하루 중 비율). 학습 때와 같은 정의."""
    from datetime import timezone
    parsed = datetime.fromisoformat(str(ts).strip().replace("Z", "+00:00"))
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed.toordinal() + (parsed.hour * 3600 + parsed.minute * 60 + parsed.second) / 86400.0


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
        "read_as": _PHOTO_SAY[tier] + _PHOTO_COMMON,
    }


# ── 사진 tier 별 말하는 법 (㉠ 축약으로 definitions 에서 옮겨 왔다 · 08-29) ──
#   [왜 옮겼나] 이 셋은 **발화 규율**이지 라우팅이 아니다. 설명문에 두면
#     ① 문맥 맨 앞이라 발화 시점과 멀고 ② 세 tier 중 **둘은 늘 헛것**이다
#     (한 번에 한 tier 만 온다) ③ ㉠ 축약의 첫 삭제 후보가 된다.
#     결과에 실으면 **해당 tier 것만** 발화 직전에 온다 — 짧아지면서 가까워진다.
#   ⚠ 문구를 줄이지 않았다. 옮긴 것이지 압축한 것이 아니다.
_PHOTO_SAY = {
    "confident": (
        "tier=confident — '○○인 것 같아요. 저희 매장엔 이런 것들이 있습니다' "
        "처럼 품목을 말하고 후보를 보이세요."),
    "category": (
        "tier=category — '○○류로 보입니다. 이 중에 필요하신 게 있나요?' 처럼 "
        "**소분류까지만** 말하세요. 품목명을 단정하면 안 됩니다."),
    "unsure": (
        "tier=unsure — '죄송합니다, 사진으로는 온전히 구별하기 어렵습니다. "
        "물품을 말씀해 주시면 정확히 답변드리겠습니다' 로 답하세요. "
        "⚠ **'저희 매장에 없습니다'라고 말하면 안 됩니다** — 못 찾은 것은 사진 "
        "판정이지 재고가 아닙니다. 있는 물건을 없다고 하는 것은 없는 물건을 "
        "있다고 하는 것만큼 나쁩니다."),
}
_PHOTO_COMMON = (
    " **어느 tier든 후보 목록을 함께 보이세요** — 손님이 정정할 길이 항상 "
    "열려 있어야 합니다. 확정은 손님이 고른 뒤에만이고, 그 뒤 가격·재고는 "
    "조회 도구로 다시 확인합니다.")


def _fetch_image(image_ref: str):
    """업로드된 이미지를 연다. 지금은 로컬 경로만 — 릴레이 계약이 정해지면 교체한다."""
    from PIL import Image
    if os.path.exists(image_ref):
        return Image.open(image_ref).convert("RGB")
    return None


# ── ④ 위치 추정 — 규칙판 자산 (08-27 층 분해와 함께 출하) ────────────────────
# ── 시설 찾기 (09-03) ────────────────────────────────────────────────────────
# 종류 → 안내판 글자. sim/map_layout.FACILITY_LABELS 와 같은 표다 — 두 저장소에서
# sim 의 배치가 다르고(CLAUDE.md §7.4-a) 하네스가 sim 을 import 하지 않으므로 여기
# 한 벌을 더 둔다. ⚠ map_layout 을 고치면 여기도 고친다(검사: tool_check 의 시설 줄).
FACILITY_LABELS = {
    "ENTRANCE": "입구", "CHECKOUT": "계산대", "EVENT": "행사 상품 매대",
    "CUSTOMER_SERVICE": "고객센터", "ATM": "ATM", "BAKERY": "베이커리",
    "FOODCOURT": "푸드코트", "ELEVATOR": "엘리베이터", "RESTROOM_M": "남자 화장실",
    "RESTROOM_F": "여자 화장실", "TRASH": "휴지통", "ESCALATOR": "에스컬레이터",
    "OPTICAL": "안경·보청기 센터", "PHARMACY": "약국", "TASTING": "시식 코너",
    "AS_CENTER": "A/S 센터", "EXPERIENCE": "가전 체험존", "LOUNGE": "휴게 라운지",
}
# 손님 말 → 종류. "화장실"은 남녀 둘 다 후보다(가까운 쪽을 고른다).
FACILITY_ALIASES = {
    "RESTROOM": ["RESTROOM_M", "RESTROOM_F"], "화장실": ["RESTROOM_M", "RESTROOM_F"],
    "TOILET": ["RESTROOM_M", "RESTROOM_F"],
}


def find_facility(kind: str, floor_no: int | None = None) -> dict:
    """시설(화장실·엘리베이터·에스컬레이터·계산대·입구·고객센터…)의 위치 — 도구 find_facility.

    [입력] kind: FACILITY_LABELS 의 키 또는 'RESTROOM'(남녀 통칭). floor_no: 층을 지정하면 그
           층만(없으면 현재 층, 위치도 모르면 전 층).
    [출력] {"location_id","kind","label","floor_no","x","y","distance_m","distance_basis",
            "position","others","read_as"} — 위치를 알면 **가장 가까운 것 하나**(거리는 백엔드
           A* 실보행, 안 되면 격자 직선 추정)와 같은 종류의 나머지. 위치를 모르면 층별 위치만.
    [location_id 가 핵심] 09-03 결정 — 시설은 `locations` 의 행이다('F1-X-RESTROOM_M-1').
      이 id 를 그대로 optimize_route 의 `facility_stops` 에 넣으면 상품과 섞어 동선을 짠다.
      백엔드 resolveStop 의 locationId 갈래가 받으므로 좌표를 따로 옮겨 적을 일이 없다.
    [왜 여기(infer)인가] 재료가 위치 추정과 같다 — 스캔 앵커와 보행 격자(_STATE). 출처 원장은
      floormap 과 같은 "infer" 칸(가드가 층·거리 숫자를 여기서 대조한다).
    [한계를 값에 싣는다] 거리 기준(route/grid_estimate)과 위치 신뢰를 read_as 에 적는다. 도면에
      없는 것(카트 보관대·주차장·흡연구역)은 unknown_kind — 지어내지 않는다.
    """
    from app.tools import compute
    kinds = FACILITY_ALIASES.get(str(kind).upper()) or [str(kind).upper()]
    bad = [k for k in kinds if k not in FACILITY_LABELS]
    if bad:
        return {"error": "unknown_kind",
                "message": (f"도면에 없는 시설입니다: {kind}. 있는 것: "
                            + ", ".join(f"{k}({v})" for k, v in FACILITY_LABELS.items())
                            + ". 카트 보관대·주차장은 도면에 없으므로 모른다고 답하세요.")}
    _ensure_floormap()
    fac = _STATE.get("facilities") or {}
    if not fac:
        return {"error": "no_facility_map",
                "message": "시설 위치를 아직 못 받았습니다(백엔드 locations tier_role=FACILITY). 층 안내판을 권하세요."}

    pos = compute.current_position()
    age = compute.position_age()
    floors = [int(floor_no)] if floor_no else ([pos[0]] if pos else [1, 2, 3])
    def points(fl_list):
        return [dict(p) for f in fl_list for p in fac.get(f, []) if p["kind"] in kinds]
    cands = points(floors)
    if not cands and floor_no is None and pos:
        # 현재 층에 없으면(계산대는 1층뿐) 전 층으로 넓힌다 — "이 층엔 없고 1층에" 가 답.
        floors = [1, 2, 3]
        cands = points(floors)
    if not cands:
        return {"error": "not_on_floor",
                "message": f"{'·'.join(FACILITY_LABELS[k] for k in kinds)} 은(는) "
                           f"{floors} 층 도면에 없습니다. 다른 층을 물어보세요."}
    for c in cands:
        c["est"] = (abs(c["x"] - pos[1]) + abs(c["y"] - pos[2])) if (pos and pos[0] == c["floor_no"]) else None

    same = [c for c in cands if c["est"] is not None]
    if same:
        same.sort(key=lambda c: c["est"])
        best = same[0]
        dist, basis = best["est"], "grid_estimate"
        if not config.USE_MOCK_SOT:
            try:   # 실보행 거리 — 백엔드 A*, 정지점은 location_id 그대로
                r = sot_client.get_navigation_route(
                    pos[0], pos[1], pos[2],
                    [{"locationId": best["location_id"], "label": best["label"]}])
                legs = (r or {}).get("legs") or []
                if legs and str(legs[0].get("status")) == "OK":
                    dist, basis = int(legs[0].get("distance", dist)), "route"
            except Exception:                                  # noqa: BLE001
                pass
        tier, _ = _confidence(age)
        read_as = (f"손님 위치 기준 가장 가까운 {best['label']}. 거리 {dist}m 는 "
                   + ("실제 보행 경로" if basis == "route" else "격자 직선 추정") + "입니다. "
                   + ("스캔 직후라 위치가 확실합니다." if tier == "high" else
                      "위치는 마지막 스캔 기준 추정이니 '마지막 스캔 기준으로'라고 밝히세요.")
                   + " 이 시설을 동선에 넣으려면 optimize_route 의 facility_stops 에 location_id 를 넣으세요.")
        others = [{k: c[k] for k in ("location_id", "kind", "label", "floor_no")}
                  for c in cands if c is not best]
        return {"location_id": best["location_id"], "kind": best["kind"], "label": best["label"],
                # 좌표는 **안 싣는다** (09-05 상류 감사). definitions.py 가 "좌표 숫자는 읽지 말고
                #   층·방향·거리로 말한다"고 광고하는데 정작 값을 손에 쥐여 주고 있었다 — 규율로 덮는 부류가 아니라 **안 보내는 것이 답인 부류**다.
                "floor_no": best["floor_no"],
                "distance_m": dist, "distance_basis": basis,
                "position": {"floor_no": pos[0]},
                "position_confidence": tier, "others": others[:6], "read_as": read_as}

    by_floor = {}
    for c in cands:
        by_floor.setdefault(str(c["floor_no"]), []).append(
            {k: c[k] for k in ("location_id", "kind", "label", "floor_no")})
    on_floors = sorted({c["floor_no"] for c in cands})
    return {"kind": kinds[0] if len(kinds) == 1 else "RESTROOM",
            "label": "·".join(dict.fromkeys(FACILITY_LABELS[k] for k in kinds)),
            "floor_no": on_floors[0] if len(on_floors) == 1 else None,
            "floors_with_facility": [{"floor_no": f} for f in on_floors],
            "position": {"floor_no": pos[0]} if pos else None,
            "distance_m": None, "distance_basis": None,
            "by_floor": by_floor,
            "read_as": (("손님은 지금 " + str(pos[0]) + "층인데 이 시설은 그 층에 없습니다 — "
                         "있는 층(floors_with_facility)을 말하고 에스컬레이터·엘리베이터로 이동을 권하세요. ")
                        if pos else
                        "손님 위치를 모릅니다(스캔 기록 없음). 층별 위치만 말하고, 몇 층인지 물어보세요. ")
                       + "좌표는 격자(1칸=1m, 원점 좌상단)라 '오른쪽 벽 쪽' 같은 방향어로 옮겨 "
                         "말하세요 — 숫자 좌표를 그대로 읽지 않습니다."}


def facility_points(kind: str | None = None) -> list[dict]:
    """시설 후보의 사본을 돌려준다. 경로 솔버가 실제 보행 비용으로 후보를 비교한다.

    기존 nearest_facility_point는 같은 층 맨해튼 거리의 빠른 안내다. 계산대 선택에
    그것을 쓰면 선반을 우회하는 비용과 출구 복귀가 빠진다. 원본 dict를 노출하면
    요청 하나의 표시 라벨 변경이 다른 요청의 시설 캐시까지 바꾸므로 복사한다.
    """
    _ensure_floormap()
    kinds = FACILITY_ALIASES.get(str(kind).upper()) or [str(kind).upper()]
    return [dict(p) for floor in (1, 2, 3)
            for p in (_STATE.get("facilities") or {}).get(floor, [])
            if kind is None or p["kind"] in kinds]


def facility_point(location_id: str) -> dict | None:
    """시설 location_id → {"location_id","kind","label","floor_no","x","y"}. compute 의 동선 정지점 해석용."""
    _ensure_floormap()
    for pts in (_STATE.get("facilities") or {}).values():
        for p in pts:
            if p["location_id"] == location_id:
                return dict(p)
    return None


def nearest_facility_point(kind: str, start: tuple | None) -> dict | None:
    """종류 → 출발점에서 가장 가까운 시설 점(같은 층 우선, 없으면 층 무관 첫 것). compute 용."""
    _ensure_floormap()
    kinds = FACILITY_ALIASES.get(str(kind).upper()) or [str(kind).upper()]
    fac = _STATE.get("facilities") or {}
    pts = [p for f in (1, 2, 3) for p in fac.get(f, []) if p["kind"] in kinds]
    if not pts:
        return None
    if start:
        same = [p for p in pts if p["floor_no"] == start[0]]
        if same:
            return dict(min(same, key=lambda p: abs(p["x"] - start[1]) + abs(p["y"] - start[2])))
    return dict(pts[0])


def get_position() -> dict:
    """위치 추정 — **스캔 앵커 + 보행 격자 스냅** (설계서 §7 출하 사양의 규칙판).

    [규칙 두 단] 센서가 없으므로 관측은 스캔뿐이다(설계 §4.1 — 맥락은 관측이
    아니라 행동 증거로 추론한다).
      ① 앵커: 마지막으로 스캔한 매대의 좌표 = 손님이 마지막으로 **확실히**
        있었던 곳. 루프가 요청마다 주입한다(compute.set_position).
      ② 스냅: 매대 칸은 장애물이라 사람이 서 있을 수 없다 — 백엔드 격자의
        가장 가까운 통행 칸으로 옮긴다. 이 좌표라야 경로 계산의 출발점이 된다.

    [한계를 값에 싣는다] 이것은 추정이고, 스캔 후 얼마나 걸었는지는 모른다.
    read_as로 그 한계를 LLM에게 전달한다 — "정확한 현재 위치"로 단정해 말하면
    손님이 자기 위치와 다른 안내를 받는다(가드가 아니라 표현 규율의 몫).

    [베이지안 필터 — 08-28 판정: **채택하지 않는다**]
    `models/position_filter.py` 가 파티클 필터를 규칙판과 겨뤘다. 필터가
    이기기도 하고 지기도 했는데, **무엇이 이기는지가 「손님이 매대 앞에서
    얼마나 머무는가」라는 가정에 달려 있었다**:

      머무름 0초·이탈 0    필터 13.1m  vs 규칙 19.6m   → 필터 승
      머무름 45초·이탈 0.7 필터 16.5m  vs 규칙 11.8m   → 규칙 승

    우리는 센서가 없어 어느 쪽이 맞는지 **알 방법이 없다.** 검증할 수 없는
    가정 위에서만 이기는 후보는 채택하지 않는다(가짜 세계의 판정이 "된다"면
    배포된다 — CLAUDE.md §2-5b).

    대신 **모든 설정에서 흔들리지 않은 것**을 가져왔다: *스캔 직후엔 앵커가
    거의 정확하고(≈2m) 시간이 지날수록 급격히 나빠진다.* 그래서 위치를 옮기지
    않고 **얼마나 믿을지**를 나이에 따라 바꾼다(아래 `_BANDS`).

    ⚠ 경로 도구는 이 도구를 안 기다린다 — 루프가 같은 앵커를 직접 주입하므로
      `optimize_route`는 여기 없이도 돈다. 이 도구의 소비자는 "지금 나 어디쯤
      이에요?" 같은 **위치 질문 자체**다(기능 6·7·10).
    """
    from app.tools import compute
    pos = compute.current_position()
    age = compute.position_age()
    if pos is None:
        return {"error": "no_scan_anchor",
                "message": ("아직 스캔 기록이 없어 위치를 추정할 수 없습니다. "
                            "손님에게 몇 층인지 물어보거나, 위치 없이 답할 수 "
                            "있는 부분만 답하세요.")}
    f, x, y = pos
    sx, sy, snapped = snap_to_walkable(f, x, y)
    tier, say = _confidence(age)
    # 좌표는 **안 싣는다** (09-05 상류 감사). definitions.py 가 "좌표 숫자는 읽지 말고
    #   층·방향·거리로 말한다"고 광고하는데 정작 값을 손에 쥐여 주고 있었다 — 규율로 덮는 부류가 아니라 **안 보내는 것이 답인 부류**다.
    return {"floor_no": int(f),
            "source": "scan_anchor+graph_snap",
            "snapped": snapped,
            "anchor_age_sec": None if age is None else round(age),
            "confidence": tier,
            "read_as": say}


# 나이 구간과 말하는 법. **미터를 싣지 않는다** — 대조표의 절대 수치는 가정한
# 운동 아래서의 값이라 손님에게 말할 자격이 없다. 실은 이렇다: 우리가 아는 것은
# 「방금 스캔했으면 거기 있다」와 「오래됐으면 모른다」 둘뿐이고, 그 둘은
# 어떤 가정에서도 참이었다.
_BANDS = [
    # ⚠ 예시에 **구역을 넣지 않는다**(08-28 정정). 이 도구는 `floor_no·x·y` 만
    #   돌려주고 **존은 안 준다** — 스냅한 통행 좌표라 매대 id 가 없다.
    #   그런데 예시가 "3층 A구역"이었다. 그대로 따라 하면 **에이전트가 존을
    #   지어내고**, 가드가 그것을 막는다(막는 것이 옳다).
    #   B 의 위치 칸 넷이 가드에 걸린 원인의 절반이 이것이었다.
    (30, "high",
     "방금 스캔한 자리입니다. 여기 계신다고 말해도 됩니다 "
     "— '지금 계신 3층에서…'. **구역은 말하지 마세요** — 이 도구는 층과 "
     "좌표만 알고 어느 구역인지는 모릅니다."),
    (120, "medium",
     "스캔한 지 좀 됐습니다. 그 근처이되 한두 통로쯤 움직였을 수 있으니 "
     "'아까 스캔하신 자리 기준으로는…' 처럼 **기준을 밝히고** 말하세요."),
    (float("inf"), "low",
     "스캔한 지 오래됐습니다. **위치를 근거로 단정하지 마세요** — "
     "'혹시 아직 3층에 계신가요?' 처럼 되묻거나, 위치 없이 답할 수 있는 "
     "부분만 답하세요. 틀린 위치로 안내하면 손님이 엉뚱한 데로 걸어갑니다."),
]


def _confidence(age):
    """앵커 나이 → (등급, 말하는 법).

    나이를 모르면(`None`) **중간 등급**으로 둔다. 모르는 것을 'high' 로 두면
    오래된 앵커를 단정해 말하게 되고, 'low' 로 두면 방금 스캔한 손님에게도
    되묻게 된다 — 둘 다 나쁘지만 **앞엣것이 더 나쁘다**(틀린 안내 vs 군더더기).
    그래서 모를 때는 가운데가 아니라 **안전한 쪽**이 기본이다.
    """
    if age is None:
        return "unknown", _BANDS[1][2] + " (스캔 시각을 몰라 보수적으로 잡았습니다.)"
    for limit, tier, say in _BANDS:
        if age < limit:
            return tier, say
    return _BANDS[-1][1], _BANDS[-1][2]


# ── ⑤ 취향 매칭 ─────────────────────────────────────────────────────────────
# 한 번에 돌려줄 최대 후보 수. predict_repurchase 와 같은 이유다 — 발화가
# 감당할 수 있는 길이가 곧 상한이고, **자른 개수는 반드시 결과에 적는다**.
PREFERENCE_MAX_ITEMS = 5

# 사전식(lexicographic) 점수의 자릿수. 대조표(preference_rank.py)가 채점에 쓴
# 그 상수를 **그대로** 옮긴다. 여기서 다른 수를 쓰면 서빙이 채점된 것과 다른
# 순위를 내므로, 대조표의 승리(P@5 0.0099)가 이 도구에 대해서는 무효가 된다.
#   _LEX_BLOCK  다양화 블록 — 무엇보다 먼저 가른다
#   _LEX_TASTE  소분류 사후확률 — 블록 안의 1순위
#   (인기 순위 g 는 계수 없이 빼서 마지막 자리를 가른다)
_LEX_BLOCK = 1e12
_LEX_TASTE = 1e6


def match_preferences(top_k: int = 3) -> dict:
    """이 손님이 좋아할 만한 품목 — 소분류 사후확률로 고르고 다양화로 끊는다.

    [무엇을 계산하나 — 세 줄]
      ① 이력에서 **소분류별 습관 종수** n_l 을 센다(횟수가 아니다).
      ② 사후:  post_l ∝ (n_l + α·전역사전_l) / (소분류크기_l × 축배율_l)
      ③ 점수:  −블록·1e12 + post[소분류] × 축배율(회원) × 1e6 − 소분류내인기순위

    [왜 「횟수」가 아니라 「종수」인가 — 이 한 줄이 자산의 요점이다]
      구매 횟수 ≈ 취향 ÷ 주기다. 우유는 주기가 16.7일이라 취향이 보통이어도
      횟수가 쌓인다. 횟수로 세면 **1위 소분류가 32.8% 갈린다**(T15 실측) —
      즉 세 명 중 한 명에게 엉뚱한 취향을 짚는다. 종수는 주기에 안 흔들린다.

    [왜 크기와 축으로 나누나] 세계가 습관을 뽑을 때
      P(습관이 소분류 l 에) ∝ 취향_l × 축배율_l × (l 의 SKU 수) 였다.
      관측한 종수에서 취향을 되찾으려면 **곱해진 것을 도로 나눠야** 한다.
      안 나누면 SKU 가 많은 소분류(가공식품)가 전원의 취향 1위가 된다.

    [왜 디리클레로 축소하나 — 콜드스타트가 특수 경로가 아닌 이유]
      회원당 습관이 ~22개뿐이라 안 산 소분류는 종수 0 이다. 그대로 쓰면 0 이
      "싫다"가 되는데 실제로는 **"모른다"**다. 전역 사전을 α만큼 섞어 축소하면
      종수가 0 일 때 식이 자동으로 `전역사전 × 축배율`만 남는다 — 이력 0건
      회원을 위한 별도 분기가 **필요 없다**. 실측: 이력 0건도 무작위의 1.7배,
      1건이면 4배(대조표 §6). 그래서 "이력 1건이면 말을 걸어도 된다".

    [다양화 cap 3 — 정확도를 얼마나 내주는지 재고 골랐다]
      ⑤ 그대로의 상위 20은 커버리지 1.00, 즉 **20개가 전부 한 소분류**다.
      맞고 틀리고 이전에 발화가 이상하다. cap 3 은 P@5 를 0.0106→0.0099(−7%)
      만 내주고 커버리지를 9.62로 올린다. cap 1 은 절반(0.0052)이라 과했다.
      ⚠ 그래도 top_k=3 이면 **한 소분류에서 셋**이 나올 수 있다. 정상이다 —
        cap 은 "연달아 셋까지"이지 "셋을 흩어라"가 아니다. read_as 가 이걸 말한다.

    [회원 축(반려·자녀)을 이력에서 **추정**한다 — 조회 창구가 없다]
      학습 때는 members 테이블의 축을 그대로 썼는데, 서빙에는 그 창구가 없다
      (predict_repurchase 도 같은 구멍을 안고 있다). 그렇다고 축배율을 1 로
      두면 안 된다 — 분모의 `l2_boost` 가 반려·기저귀 소분류를 **전역적으로
      깎아 놓았기** 때문에, 되돌려 주지 않으면 반려인이 반려용품을 영영 못 본다.
      그래서 "그 소분류를 산 적이 있으면 그 축이 있다"로 추정한다. 이 세계에선
      습관 표집이 축으로 가중되므로 강한 신호다. 다만 **추정이라 결과에 적는다**
      (`axes_inferred`) — 나중에 창구가 열리면 이 세 줄만 갈아 끼우면 된다.

    [반환] 오류가 아니면 items(0개 이상) + taste(상위 소분류) + read_as.
    """
    from app.tools import query                                # 순환 import 회피
    b = _STATE["preference"]
    if b is None:
        return {"error": "model_not_loaded",
                "message": "취향 매칭 자산이 적재되지 않았습니다."}

    member_id = query.current_member_id()
    if member_id is None:
        return {"error": "no_member",
                "message": ("비회원 세션이라 취향을 알 수 없습니다. "
                            "로그인하면 추천할 수 있다고 안내하세요.")}

    k = max(1, int(top_k or 3))
    capped = k > PREFERENCE_MAX_ITEMS
    k = min(k, PREFERENCE_MAX_ITEMS)

    hist = sot_client.get_purchase_history(member_id) or []
    # **종수**를 세는 것이므로 sku 를 집합으로 만든다(같은 sku 를 열 번 사도 1).
    bought = {int(r["sku_id"]) for r in hist if r.get("sku_id") is not None}

    l2 = b["l2_of_sku"]
    S = len(l2)
    L = len(b["l2_names"])
    ix = b["sku_ix"]
    # 이력의 sku 를 출하물 축의 자리번호로 옮긴다. 출하물에 없는 sku 는 빠진다
    # (카탈로그가 갱신됐거나 세계가 다른 경우) — 아래 겹침 가드가 그걸 잡는다.
    seen_ix = [ix[v] for v in bought if v in ix]

    dst = np.zeros(L, np.float64)
    if seen_ix:
        np.add.at(dst, l2[np.array(seen_ix, np.int64)], 1.0)

    post = ((dst + b["alpha"] * b["l2_prior"].astype(np.float64))
            / (b["l2_size"].astype(np.float64) * b["l2_boost"].astype(np.float64)))
    post /= post.sum()

    # 축 추정 — 위 독스트링 [회원 축] 참조.
    pet_l2, kid_l2 = b["axis_pet_l2"], b["axis_kid_l2"]
    has_pet = bool(dst[pet_l2].sum() > 0)
    has_kid = bool(dst[kid_l2].sum() > 0)
    boost_l2 = np.ones(L, np.float64)                          # 이 회원의 소분류 배율
    if has_pet:
        boost_l2[pet_l2] *= b["axis_mult"]
    if has_kid:
        boost_l2[kid_l2] *= b["axis_mult"]
    boost_s = boost_l2[l2]                                     # SKU 로 펼친 것

    # **보고용 취향 = 배율까지 반영한 것.** post 만으로 순위를 적으면 근거가
    # 결정과 달라진다 — 실측으로 걸렸다: 반려인 회원의 1위 후보가 「반려간식」인데
    # `l2_rank` 는 6 이라고 적혔다(post 1위는 「신발」). 손님에게 읽어 줄 근거가
    # "6위인데 왜 1등"이 되면, 그건 근거가 아니라 **다른 계산의 흔적**이다.
    # 점수식 자체는 안 건드린다(대조표와 같아야 한다) — 보고만 바로잡는다.
    post_eff = post * boost_l2
    post_eff /= post_eff.sum()

    # ⚠ **float64 여야 한다.** 사전식 점수는 앞자리가 1e12 인데 float32 는
    #   그 근처에서 최소 간격이 6만이 넘는다 — 뒷자리(취향·인기)가 통째로
    #   반올림돼 사라지고 전부 동점이 된다. 조용히 틀리는 종류의 버그다.
    score = (-b["blk"] * _LEX_BLOCK
             + post[l2] * boost_s * _LEX_TASTE
             - b["g"].astype(np.float64))
    if seen_ix:
        score[np.array(seen_ix, np.int64)] = -np.inf           # 이미 산 것은 후보 아님

    # 여유를 두고 뽑는다 — SoT 가 못 알아보는 sku(단종·미적재)가 섞일 수 있다.
    order = np.argsort(-score)[: k * 4]
    cand = [int(b["sku"][i]) for i in order if np.isfinite(score[i])]

    # 이름·가격·행사는 **SoT 에서** 온다(헌법 1). 출하물에는 sku 와 점수뿐이다.
    rows = sot_client.get_products_by_skus(cand) if cand else []
    by_sku = {r.get("sku_id"): r for r in rows if r.get("sku_id") is not None}

    # ⚠ 겹침 가드 — 후보는 뽑혔는데 SoT 가 하나도 못 알아본 경우.
    #   출하물의 카탈로그와 지금 SoT 의 카탈로그가 **다른 세계**라는 뜻이다.
    #   mock(6종)에서 늘 이렇게 되고, 실물에서도 카탈로그를 갈아엎으면 이렇게
    #   된다. 빈 목록으로 돌려주면 "추천할 게 없네요"라는 **거짓 발화**가 나온다
    #   — 실제로는 없는 게 아니라 못 알아본 것이다. 그래서 이유를 말한다.
    if cand and not by_sku:
        return {"state": "catalog_mismatch",
                # 09-05: 오류 갈래에도 member_id 를 안 싣는다 — 유출 경로는
                # 성공 갈래보다 **실패 갈래에서 더 잘 열린다**(감사 발견 ①).
                "message": ("취향 모델의 카탈로그와 지금 조회되는 상품 목록이 "
                            "겹치지 않습니다. 추천을 만들 수 없으니 이 기능 "
                            "없이 답하고, 추천이 '없다'고 말하지 마세요."),
                "artifact_version": b["version"]}

    items = []
    for sku in cand:
        r = by_sku.get(sku)
        if r is None:
            continue
        i = ix[sku]
        li = int(l2[i])
        items.append({
            "sku_id": sku,
            "name": r.get("name"),
            "category_l2": r.get("category_l2") or b["l2_names"][li],
            "price_krw": r.get("price_krw"),
            "final_price_krw": r.get("final_price_krw"),
            "on_promo": bool(r.get("on_promo")),
            # 근거는 **점수의 재료 그대로**다. 지어낸 문장을 주면 LLM 이 그걸
            # 옮겨 적고, 우리는 왜 그렇게 말했는지 못 추적한다.
            "why": {"l2": b["l2_names"][li],
                    "bought_in_l2": int(dst[li]),
                    "l2_rank": int(np.sum(post_eff > post_eff[li])) + 1,
                    "axis_boosted": bool(boost_l2[li] > 1.0),
                    "popularity_rank_in_l2": int(b["g"][i]) + 1},
        })
        if len(items) >= k:
            break

    top_l2 = np.argsort(-post_eff)[:3]
    return {
        # ⚠ 09-05 상류 감사 — `member_id` 를 안 싣는다. 모델이 쓸 일이 없고
        #   결과에 있으면 "회원 1001 님" 으로 읽힐 길만 생긴다. 규율로
        #   덮는 부류가 아니라 **안 보내는 것이 답인 부류**다.
        "items": items,
        "history_skus": len(bought),
        "taste": [{"l2": b["l2_names"][int(j)],
                   "bought": int(dst[int(j)]),
                   "share": round(float(post_eff[int(j)]), 4)} for j in top_l2],
        "axes_inferred": {"has_pet": has_pet, "has_child": has_kid},
        "truncated_to": (PREFERENCE_MAX_ITEMS if capped else None),
        "model": b["method"],
        "artifact_version": b["version"],
        "read_as": (
            "후보와 근거만 말하고, 이유를 지어내지 마세요 — why 에 담긴 것만 "
            "씁니다. 후보 여럿이 같은 소분류일 수 있습니다(다양화는 소분류당 "
            # ⚠ 09-01: 여기에 `history_skus` 라고 칸 이름을 적었더니 모델이 그것을
            #   **손님 발화에 그대로 옮겼다** — "(history_skus=0) 정확도가 낮지만".
            #   규율은 모델에게 하는 말인데, 칸 이름을 쓰면 그 말이 새어 나갈
            #   통로가 열린다. 조건은 **사람 말로** 적는다.
            "구매한 상품 종류가 열 가지 미만이면 '아직 잘 모르지만'을 붙이세요. "
            "⚠ 그때도 **숫자나 칸 이름을 발화에 넣지 마세요** — 손님은 우리가 "
            "무엇을 세는지 알 이유가 없습니다. "
            "⚠ axes_inferred(반려·자녀)는 **구매 이력에서 추정한 것**이지 "
            "손님이 알려준 정보가 아닙니다 — '반려동물 키우시죠?'처럼 단정하지 "
            "말고, 그 소분류를 사셨다는 사실까지만 말하세요. "
            "⚠ 재고와 위치는 여기 없습니다. 필요하면 get_inventory 로 확인하세요."),
    }


REGISTRY = {
    "predict_availability": predict_availability,
    "predict_repurchase": predict_repurchase,
    "identify_product_photo": identify_product_photo,
    "get_position": get_position,
    "find_facility": find_facility,             # 09-03
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
        # ⚠ 09-01: 예전에는 `message` 에 예외 문자열만 담았다. 그러면 모델이
        #   받은 것이 `HTTPStatusError: Client error '404' for url http://…` 이고,
        #   그걸 손님 말로 옮긴 결과가 **"백엔드 응답에 문제가 있는 것 같아요"**
        #   였다. 손님은 우리 서버 구조를 알 이유가 없다.
        #   → 원인은 **로그로**(고치는 사람에게), 발화 규율은 **결과로**(모델에게).
        #   다른 도구들이 이미 그렇게 한다(`no_member`·`catalog_mismatch`).
        print(f"[infer] {tool_name} 실패 — {type(e).__name__}: {e}")
        return {"error": "infer_failed",
                "detail": f"{type(e).__name__}: {e}",     # 트레이스·디버깅용
                "message": ("이 기능을 지금 쓸 수 없습니다. **이 기능 없이 답할 수 "
                            "있는 부분만** 답하고, 손님에게는 '지금 그건 확인이 "
                            "어렵다'까지만 말하세요. ⚠ 서버·백엔드·오류 같은 "
                            "내부 사정은 언급하지 마세요.")}
