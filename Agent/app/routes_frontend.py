# -*- coding: utf-8 -*-
# ============================================================================
# 프론트 직행 창구 3종 — 백엔드 `AiProxyController` 가 우리에게 넘기는 경로
# ============================================================================
# [무엇인가] 손님이 **채팅이 아닌 화면**에서 일으키는 세 가지 요청을 받는다.
#   프론트 → 백엔드(`/api/ai/*`) → **여기**. 백엔드는 열어보지 않고 그대로
#   릴레이만 한다(인증·세션은 계속 백엔드가 들고 있는 구조).
#
#     POST /api/ai/search                    검색 화면의 「AI 자연어 검색」 토글
#     GET  /api/products/{skuId}/alternatives 상품 상세의 「대체상품」 칸
#     POST /api/ai/photo-search              채팅 입력창의 사진 버튼
#
#   ⚠ 경로가 셋 다 다른 규칙으로 생겼다. 우리가 고른 것이 아니라 **백엔드
#     프록시가 부르는 주소 그대로**다(`AiProxyController`). 특히 둘째는
#     `/api/ai/...` 가 아니라 `/api/products/...` 다 — 프론트가 보는 주소
#     (`/api/ai/products/{id}/alternatives`)와도 다르다. 프록시가 중간에서
#     이름을 바꾼다. 여기서 맞춰야 하는 것은 **프록시가 부르는 쪽**이다.
#
# [왜 main.py 가 아니라 별도 파일인가] 설계서 §4.3 의 **통로 둘**이 여기서
#   갈린다. `main.py` 의 `/agent/chat` 은 **에이전트 경로**(LLM 이 도구를
#   동적으로 고르고 가드가 검사하고 발화한다)이고, 이 셋은 **워크플로 경로**
#   (고정 도구 레시피 · 발화 없음 · 화면이 곧 출력)다. 한 파일에 두면 다음에
#   고치는 사람이 "여기도 가드를 걸어야 하나"를 매번 다시 판단하게 된다.
#   경계를 머릿속 규칙이 아니라 **파일로** 둔다(CLAUDE.md §2-5a 와 같은 계열).
#
# [왜 가드를 안 거나] 가드(`guard.check`)는 **발화**를 검사한다 — "LLM 이 지어낸
#   숫자가 문장에 섞였나". 여기는 문장을 만들지 않는다. 도구가 낸 dict 를 화면
#   필드로 옮길 뿐이라 지어낼 자리가 없다. 근거 없는 값이 나가는 유일한 경로가
#   LLM 이고, 그 LLM 은 아래 ①에서 **검색 조건만** 만든다(상품을 만들지 않는다).
#
# [헌법 6 — 왜 셋 다 `def` 인가] `async def` 로 두면 이벤트 루프에서 직접
#   돌아 그 안의 **블로킹 호출이 서버 전체를 세운다.** 셋 다 블로킹이다
#   (HTTP·SDK·GPU). `def` 로 두면 FastAPI 가 스레드풀로 보낸다.
# ============================================================================
from __future__ import annotations

import os
import tempfile
import httpx

from fastapi import APIRouter, File, UploadFile, Header, HTTPException
from pydantic import BaseModel, Field

from app import config, loop, sot_client
from app.tools import compute, infer

# APIRouter — `app` 을 여기서 만들지 않고 라우트만 모아 두는 그릇.
# main.py 가 `app.include_router(...)` 로 붙인다. 이렇게 하면 이 파일이
# FastAPI 인스턴스를 몰라도 되고(순환 import 가 안 생긴다), 라우트를 통째로
# 뺄 때도 한 줄이다.
router = APIRouter()


# ── 상품 한 줄: 우리 계약(snake) → 프론트 카드(camel) ────────────────────────
# [왜 되돌리나] 백엔드가 camelCase 로 주는 것을 `sot_client._norm_product` 가
#   snake 로 바꾼다(경계에서 한 번만 — 08-27 판정). 그런데 이 셋의 소비자는
#   LLM 이 아니라 **프론트 화면**이고, 화면은 백엔드의 `ProductSearchResponse`
#   모양을 기대한다. 그래서 경계를 나갈 때 되돌린다.
#
# [왜 자동 변환(snake→camel 규칙)이 아니라 표인가] 규칙으로 짜면
#   `price_krw → priceKrw` 는 맞지만 `category_l1 → categoryL1` 이 안 맞는다
#   (규칙대로면 `categoryL1` 이 아니라 `categoryL_1`·`categoryL1` 사이에서
#   구현마다 갈린다). **한 글자만 어긋나도 화면에서 값이 빈 칸으로 나오고,
#   그건 에러가 아니라 「없는 상품」처럼 보인다.** 표로 못 박는다.
#
# ⚠ `imageUrl`·`lifecycleStatus` 는 **여기에 없다.** `_norm_product` 가 그
#   둘을 안 싣기 때문이고, 지금은 무해하다 — 프론트가 `imageUrl` 이 없으면
#   회색 상자로 떨어지게 이미 짜여 있고, 상품 이미지 353MB 는 아직 프론트에
#   인도되지 않아 어차피 404 다(F2). **이미지가 인도되는 날 `_norm_product`
#   에 `image_url` 을 더하고 이 표에도 한 줄을 더한다** — 그 전에는 여기만
#   고쳐도 값이 없어서 안 나온다.
_CARD_FIELDS = {
    "sku_id":       "skuId",
    "name":         "name",
    "brand":        "brand",
    "category_l1":  "categoryL1",
    "category_l2":  "categoryL2",
    "price_krw":    "priceKrw",
    "unit":         "unit",
    "spec_raw":     "specRaw",
    "spec":         "spec",
    "on_promo":     "onPromo",
    "discount_krw": "discountKrw",
    # 행사 중이면 손님이 계산대에서 낼 금액이 정가와 다르다. 화면의 가격은
    # 이쪽이어야 한다 — `_norm_product` 가 이 값을 살리는 이유와 같다.
    "final_price_krw": "finalPriceKrw",
}


def _card(row: dict) -> dict:
    """상품 한 줄을 화면이 읽는 이름으로 옮긴다.

    [무엇을 하나] `_CARD_FIELDS` 표대로 키 이름만 바꾼 새 dict 를 만든다.
    [왜 `if k in row` 인가] 실물 백엔드가 어떤 필드를 안 줄 수 있다. 그때
      `KeyError` 로 죽는 대신 **그 키만 빠진 채로** 넘어간다 — 카드 하나의
      단위가 안 보이는 것과 검색 전체가 500 이 되는 것은 무게가 다르다.
      (`query._pick` 이 같은 이유로 같은 모양을 쓴다.)
    """
    return {camel: row[snake] for snake, camel in _CARD_FIELDS.items() if snake in row}


# ── ① POST /api/ai/search — 자연어 한 줄 → 검색 조건 → 상품 목록 ────────────
class SearchBody(BaseModel):
    """프록시가 넘기는 몸통. 백엔드는 `Map<String,String>` 을 그대로 흘린다."""
    query: str = Field(min_length=1, description="손님이 검색창에 친 자연어")


# LLM 이 조건을 못 만들었을 때 쓸 최후 수단. 자연어를 통째로 키워드로 넣는다.
# **틀린 답을 주는 것보다 덜 똑똑한 답을 주는 쪽**이 낫다 — 여기서 예외를 내면
# 검색창이 통째로 죽지만, 키워드 검색으로 떨어지면 적어도 화면은 돈다.
def _fallback_params(q: str) -> dict:
    return {"keyword": q}


def _extract_params(q: str) -> dict:
    """자연어에서 **검색 조건만** 뽑는다. 상품을 고르는 것이 아니다.

    [왜 LLM 인가] 헌법 2 — 이해는 LLM, 검색은 솔버(백엔드 질의). "1인 가구가
      쓸 만한 만원 아래 세제" 를 `{keyword:"세제", max_price:10000}` 으로
      옮기는 일은 규칙으로 못 짠다. 그 다음 **누가 걸리는지는 DB 가 정한다.**
    [왜 도구 정의를 그대로 쓰나] `definitions.TOOLS` 의 `search_products` 항목이
      이미 인자와 뜻을 다 적어 두었다. 여기서 다시 쓰면 두 벌이 되고, 한쪽만
      고치는 날 **조용히 갈린다**(같은 이유로 `schema_check.py` 가 존재한다).
    [`tool_choice` 를 왜 강제하나] 강제하지 않으면 모델이 도구를 안 부르고
      말로 답할 수 있다. 그러면 `tool_use` 블록이 없어 조건이 안 나온다.
    [실패하면] 예외를 밖으로 내보내지 않고 키워드 검색으로 떨어진다 — 위 주석.
    """
    from app.tools import definitions
    spec = next(t for t in definitions.TOOLS if t["name"] == "search_products")
    try:
        client = loop._get_client()
        resp = client.messages.create(
            model=config.LLM_MODEL,
            max_tokens=512,
            tools=[spec],
            # {"type": "tool", "name": ...} — "반드시 이 도구를 불러라".
            tool_choice={"type": "tool", "name": "search_products"},
            messages=[{"role": "user", "content":
                       f"손님이 검색창에 이렇게 썼습니다: {q}\n"
                       f"이 문장에서 읽을 수 있는 조건만 인자로 옮기세요. "
                       f"문장에 없는 조건은 넣지 마세요."}],
        )
        for block in resp.content:
            if getattr(block, "type", None) == "tool_use":
                return dict(block.input)
    except Exception as e:                                     # noqa: BLE001
        # ⚠ **삼키되 말한다.** 09-01 에 이 자리를 `except: pass` 로 뒀다가
        #   바로 물렸다 — 키가 안 읽힌 상태(`load_env()` 누락)에서 세 질문이
        #   전부 폴백으로 떨어졌는데 **화면은 멀쩡히 결과를 냈다.** 검색이
        #   조용히 「AI 아님」으로 강등되고 아무도 모르는 상태다.
        #   광범위 `except` 가 원인을 가린 사고가 이 저장소에만 다섯 번째다.
        print(f"[routes_frontend] 조건 추출 실패 → 키워드 검색으로 강등: "
              f"{type(e).__name__}: {e}")
    return _fallback_params(q)


@router.post("/api/ai/search")
def ai_search(body: SearchBody) -> dict:
    """검색 화면의 AI 모드. 조건은 LLM 이, 상품은 DB 가 고른다.

    [출력] `{"results": [카드…], "interpreted": {조건}, "correctedFrom": …}`
      프론트는 `res.results` 를 읽고 배열이면 그대로 쓴다(방어적 파싱).
    [왜 `_search_products`(도구) 가 아니라 `sot_client` 를 부르나]
      도구판은 결과를 **LLM 이 읽을 9개 필드로 줄이고**(`_SEARCH_FIELDS`)
      상한(`MAX_SEARCH_RESULTS`)으로 자른다. 화면은 가격·행사·단위까지 다
      필요하고 목록도 길수록 좋다 — **소비자가 다르면 투영도 다르다.**
    """
    params = _extract_params(body.query)
    # 도구 정의에 없는 인자를 모델이 지어냈을 수 있다. `sot_client` 가 받는
    # 것만 통과시킨다 — 모르는 인자를 그대로 넘기면 TypeError 로 죽는다.
    allowed = {"keyword", "category_l1", "category_l2",
               "max_price", "on_promo_only", "new_within_days"}
    params = {k: v for k, v in params.items() if k in allowed and v is not None}

    rows = sot_client.search_products(**params)

    # 0건이면 검색어 후보정을 한 번 — 도구판(`query._search_products`)과 **같은
    # 규칙**이다. 오타는 채팅에서만 나는 것이 아니라 검색창에서 더 많이 난다.
    corrected = None
    kw = params.get("keyword")
    if not rows and kw:
        from app import searchterm
        hit = searchterm.suggest(kw)
        if hit and hit[0] != kw:
            rows = sot_client.search_products(**dict(params, keyword=hit[0]))
            if rows:
                corrected = {"from": kw, "to": hit[0]}

    return {
        "results": [_card(r) for r in rows],
        # 무엇으로 알아들었는지 돌려준다. 화면이 지금 쓰지 않아도 **연동을
        # 디버깅할 때 이 한 칸이 "왜 이게 나왔지"를 즉시 가른다.**
        "interpreted": params,
        # 다른 낱말로 찾았으면 **말한다.** 조용히 바꾸면 손님은 자기가 친 것의
        # 답을 봤다고 믿는다(`query._search_products` 의 `corrected_from` 과 같은 규율).
        "correctedFrom": corrected,
    }


# ── ② GET /api/products/{skuId}/alternatives — 대체상품 ─────────────────────
@router.get("/api/products/{sku_id}/alternatives")
def product_alternatives(sku_id: int) -> dict:
    """상품 상세의 대체상품 칸. **LLM 없이** 솔버가 고른다.

    [출력] `{"original": 카드, "alternatives": [카드…]}`
      백엔드 `AlternativesResponse` 와 같은 모양이라 화면이 그대로 읽는다.
    [왜 LLM 이 없나] 대체품 선정은 **순위 계산**이다 — 같은 소분류·재고 있음·
      가격 근접·재구매율. 헌법 2 그대로 계산은 솔버가 한다. 여기에 LLM 을
      넣으면 느려지고 비싸지고, 무엇보다 **순위가 매번 달라진다.**
    [`_find_substitutes` 가 dict 를 돌려주는 이유] 도구는 예외를 던지지 않고
      `{"error": …}` 를 값으로 돌려준다(루프가 그 문자열을 LLM 에게 보여줘야
      하므로). 그래서 여기서도 **예외가 아니라 값**을 검사한다.
    """
    result = compute._find_substitutes(sku_id)

    # 원 상품을 못 찾음 = 잘못된 skuId. 화면은 빈 목록을 받아 칸을 접으면 된다
    # (프론트 `getAlternatives` 가 실패를 `[]` 로 흡수하게 이미 짜여 있다).
    if result.get("error"):
        return {"original": None, "alternatives": []}

    subs = result.get("substitutes") or []
    # 도구가 돌려준 대체품 줄에는 순위 계산에 쓴 값들이 섞여 있다. 화면에 필요한
    # 것은 상품 한 줄이므로 `_card` 로 같은 모양으로 눕힌다.
    return {
        "original": _card(result.get("original") or {}),
        "alternatives": [_card(s) for s in subs],
    }


# ── ③ POST /api/ai/photo-search — 사진 한 장 → 후보 목록 ────────────────────
@router.post("/api/ai/photo-search")
def photo_search(photo: UploadFile = File(...)) -> dict:
    """채팅 입력창의 사진 버튼. **품목을 단정하지 않는다.**

    [출력] `{"productName": …|None, "results": [{skuId, productName}…], "tier": …}`
      프론트 `PhotoSearchResult` 계약. `productName` 은 **tier=confident 일
      때만** 채운다 — 나머지 tier 에서 채우면 화면이 그것을 정답처럼 보인다.
    [왜 그렇게까지 조심하나] T9 §9.1 — 최고 유사도의 AUC 가 0.465 라 **점수가
      정오를 못 가른다.** 그래서 확신은 점수가 아니라 tier(후보들의 순도)로만
      말하고, 어느 tier 든 후보 목록을 함께 낸다(손님이 정정할 길).
    [`def` 인 이유] 안에서 GPU 순전파가 돈다(헌법 6). `async def` 로 두면
      그 몇 초 동안 서버 전체가 다른 요청을 못 받는다.
    [왜 임시 파일인가] `infer._fetch_image` 가 **로컬 경로만** 연다. 업로드는
      메모리에 오므로 디스크에 한 번 내려놓고 경로를 넘긴다. `finally` 로
      반드시 지운다 — 안 지우면 시연 중에 손님 사진이 서버에 쌓인다.
    """
    data = photo.file.read()          # `def` 라우터라 동기 read (await 아님)
    if not data:
        return {"productName": None, "results": [], "tier": "unsure",
                "message": "사진 파일이 비어 있습니다."}

    # delete=False — 윈도우는 열려 있는 파일을 다른 핸들로 못 여는 경우가 있어
    # 먼저 닫고 경로만 넘긴다. 지우는 책임은 아래 finally 가 진다.
    tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
    try:
        tmp.write(data)
        tmp.close()
        out = infer.identify_product_photo(tmp.name)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass                       # 지우기 실패가 응답을 막을 이유는 없다

    # 인코더가 안 올라온 서버(=`LOAD_PHOTO_ENCODER=0`)거나 사진을 못 읽은 경우.
    # ⚠ 빈 목록을 주되 **"매장에 없다"는 뜻이 되지 않게** message 로 사유를 남긴다.
    if out.get("error"):
        return {"productName": None, "results": [], "tier": "unsure",
                "error": out["error"],
                "message": out.get("message") or "사진 검색을 사용할 수 없습니다. 잠시 뒤 다시 시도해 주세요."}

    cands = out.get("candidates") or []
    return {
        # 단정은 confident 에서만. 나머지는 None → 화면이 후보만 보인다.
        "productName": (cands[0]["item"] if out.get("tier") == "confident" and cands
                        else None),
        "results": [{"skuId": c["sku_id"], "productName": c["name"]} for c in cands],
        "tier": out.get("tier"),
        "categoryL2": out.get("l2"),
    }


class RouteAnchor(BaseModel):
    """사용자가 확인한 위치만 받는다. 실제 좌표 해석·시설 존재 확인은 솔버가 한다."""
    skuId: int | None = Field(default=None, gt=0)
    locationId: str | None = Field(default=None, max_length=80)
    floorNo: int | None = Field(default=None, ge=1, le=3)
    x: int | None = Field(default=None, ge=0, le=94)
    y: int | None = Field(default=None, ge=0, le=74)


class RouteBody(BaseModel):
    """미수집 상품과 확인 위치. 0개여도 계산대·출구 경로는 필요하다."""
    skuIds: list[int] = Field(max_length=40)
    lastScannedSkuId: int | None = Field(default=None, gt=0)
    anchor: RouteAnchor | None = None
    detourLocationId: str | None = Field(default=None, max_length=80)
    paid: bool = False


@router.post("/api/ai/route-optimize")
def route_optimize(body: RouteBody) -> dict:
    """화면 → compute → 제약 솔버 → Spring A* 경로. 구매 상태를 바꾸지 않는다."""
    if config.USE_MOCK_SOT:
        return {"error": "real_map_required", "message": "실제 매장 연결을 확인해 주세요."}
    if any(s <= 0 for s in body.skuIds):
        return {"error": "invalid_sku", "message": "상품 번호를 확인해 주세요."}
    anchor = body.anchor.model_dump(exclude_none=True) if body.anchor else None
    if not anchor and body.lastScannedSkuId:
        anchor = {"skuId": body.lastScannedSkuId}
    if anchor and "floorNo" in anchor and ("x" not in anchor or "y" not in anchor):
        return {"error": "invalid_anchor", "message": "출발 좌표를 확인해 주세요."}
    return compute._optimize_route(sku_ids=body.skuIds, shopping={
        "anchor": anchor, "detour_id": body.detourLocationId, "paid": body.paid,
    })


class InsightsBody(BaseModel):
    skuIds: list[int] = Field(max_length=40)
    consumerId: int | None = Field(default=None, gt=0)


@router.post("/api/ai/list-insights")
def list_insights(body: InsightsBody, x_internal_service_key: str = Header(default="")) -> dict:
    """실제 소비주기·가용예측을 리스트 보조 정보로 전달한다.

    JWT는 Spring에서 검증하고 서버 간 키로 이 경계를 확인한다. 본문에 임의 회원
    번호를 보내 남의 구매 이력을 조회하는 경로를 막는다. ContextVar 신원은 finally로
    복구한다. 모델 누락/큐 조회 실패는 예측을 비우며 가짜 확률을 채우지 않는다.
    """
    import secrets
    from app.tools import query
    expected = os.environ.get("INTERNAL_SERVICE_KEY", "")
    if not expected or not secrets.compare_digest(expected, x_internal_service_key):
        raise HTTPException(status_code=403, detail="서버 간 인증이 필요합니다.")
    ids = list(dict.fromkeys(body.skuIds))
    if any(s <= 0 for s in ids):
        raise HTTPException(status_code=422, detail="상품 번호를 확인해 주세요.")
    rows = {s: {"skuId": s} for s in ids}
    token = query._CURRENT_MEMBER_ID.set(config.to_member_id(body.consumerId))
    try:
        # 기존 추론 도구는 발화 길이를 위해 5개씩 반환하므로 화면에서는 분할 호출한다.
        if body.consumerId is not None:
            for offset in range(0, len(ids), infer.REPURCHASE_MAX_ITEMS):
                try:
                    result = infer.predict_repurchase(ids[offset:offset+infer.REPURCHASE_MAX_ITEMS])
                    for r in result.get("items", []):
                        cycle = r.get("typical_cycle_days")
                        # 같은 날 반복 시연으로 생긴 수 분 간격을 소비주기 0일로 안내하지 않는다.
                        elapsed = r.get("days_since_last")
                        if cycle and cycle >= 1 and (elapsed is None or elapsed >= 0) and r["sku_id"] in rows:
                            personal = (r.get("past_intervals") or 0) > 0
                            text = f'{"구매 이력 기준" if personal else "같은 소분류의 일반적인"} 소비주기 약 {cycle:.0f}일'
                            if personal and r.get("days_since_last") is not None:
                                text += f' · 마지막 구매 후 {r["days_since_last"]:.0f}일'
                            rows[r["sku_id"]]["repurchase"] = text + " (추정)"
                except (ValueError, KeyError, httpx.HTTPError):
                    pass  # 한 묶음의 누락이 다른 상품 정보까지 지우지 않게 한다.
        for sku in ids:
            try:
                result = infer.predict_availability(sku)
                curve = result.get("curve") or []
                # prob_pct는 이미 백분율이다. 다시 100을 곱하면 7,500% 같은 값이 된다.
                points = [p for p in curve if p.get("prob_pct") is not None and p.get("within")]
                if not result.get("error") and points:
                    point = next((p for p in points if p["prob_pct"] >= 50), points[-1])
                    pct = point["prob_pct"]
                    shown = "0.1% 미만" if pct < 0.1 else "99.9% 초과" if pct > 99.9 else f"{pct:.1f}%"
                    rows[sku]["availability"] = f'보충 대기 · {point["within"]} 내 매대 가용 확률 {shown} (예측, 입고 확정 아님)'
            except (ValueError, KeyError, httpx.HTTPError):
                pass
        return {"items": list(rows.values()), "personalized": body.consumerId is not None}
    finally:
        query._CURRENT_MEMBER_ID.reset(token)
