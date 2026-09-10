"""Home cards reuse the shipped inference tools; prices and products remain SoT facts."""
import math
from app import config, sot_client
from app.tools import infer, query


def recommend(consumer_id, limit=8):
    if consumer_id is None:
        return {"items": [], "status": "login_required", "message": "로그인하면 구매 이력을 참고해 추천해 드려요."}
    token = query._CURRENT_MEMBER_ID.set(config.to_member_id(consumer_id))
    try:
        candidates, unavailable = {}, []
        for name, call in [("repurchase", infer.predict_repurchase),
                           ("preference", lambda: infer.match_preferences(top_k=limit))]:
            try:
                result = call()
                if result.get("error"):
                    unavailable.append({"source": name, "reason": result["error"]})
                    continue
                for row in result.get("items", []):
                    sku = row.get("sku_id")
                    if not isinstance(sku, int) or sku in candidates:
                        continue
                    if name == "repurchase":
                        days, cycle = row.get("days_since_last"), row.get("typical_cycle_days")
                        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (days, cycle)) or days < 0 or cycle < 1 or not row.get("past_intervals"):
                            continue
                        reason = f"마지막 구매 후 {days:.0f}일 · 구매 이력 기준 소비주기 약 {cycle:.0f}일 (추정)"
                        badge = "재구매 시점 참고"
                        evidence = {"daysSinceLast": days, "typicalCycleDays": cycle}
                        personalized = True
                    else:
                        why = row.get("why") or {}
                        category = why.get("l2") or row.get("category_l2") or "상품"
                        count = why.get("bought_in_l2") or 0
                        personalized = count > 0
                        reason = (f"이전에 구매한 {category} 분야를 참고한 취향 후보예요." if personalized
                                  else f"{category} 분야의 일반적인 구매 경향을 참고한 후보예요.")
                        if (result.get("history_skus") or 0) < 10:
                            reason = "아직 취향을 충분히 알지는 못하지만, " + reason
                        badge = "취향 추천" if personalized else "처음 만나는 추천"
                        evidence = {"category": category, "boughtInCategory": count,
                                    "artifactVersion": result.get("artifact_version")}
                    candidates[sku] = {"source": name, "reason": reason, "badge": badge,
                                       "personalized": personalized, "evidence": evidence}
            except Exception:
                unavailable.append({"source": name, "reason": "inference_unavailable"})
        ids = list(candidates)[:limit]
        products = sot_client.get_product_cards(ids) if ids else []
        by_id = {p["sku_id"]: p for p in products}
        items = []
        for sku in ids:
            p = by_id.get(sku)
            if not p or p.get("discontinued") or p.get("lifecycle_status") in ("DISCONTINUED", "INACTIVE") or not p.get("name"):
                continue
            price = p.get("final_price_krw", p.get("price_krw"))
            if price is None:
                continue
            items.append({"skuId": sku, "name": p["name"], "priceKrw": price,
                          "categoryL1": p.get("category_l1"), "imageUrl": p.get("image_url"), **candidates[sku]})
        return {"items": items, "status": "ready" if items else "unavailable" if any(x["reason"] != "no_history" for x in unavailable) else "insufficient_history",
                "message": "구매 이력과 취향 추정을 참고한 추천이에요." if items else "지금은 추천 근거가 충분하지 않아요. 상품 검색을 이용해 주세요.",
                "unavailableSources": unavailable}
    finally:
        query._CURRENT_MEMBER_ID.reset(token)
