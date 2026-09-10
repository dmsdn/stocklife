"""Request-local cart selection; account-wide default carts are not a chat identity."""
from contextvars import ContextVar

_GROUP = ContextVar("chat_group", default=None)


def set_group(group_id):
    _GROUP.set(group_id)


def groups(consumer_id=None):
    from app import sot_client
    from app.tools import action
    cid = consumer_id if consumer_id is not None else action.current_consumer_id()
    if cid is None:
        return []
    rows = sot_client._http_get("/internal/cart/groups", {"consumerId": cid},
                                headers=sot_client._internal_headers())
    if not isinstance(rows, list):
        raise ValueError("리스트 목록 응답을 확인하지 못했습니다.")
    return rows


def resolve_group(explicit=None):
    from app import config
    if config.USE_MOCK_SOT:
        return explicit or _GROUP.get(), None
    try:
        owned = [g for g in groups() if g.get("status") != "COMPLETED"]
    except Exception:
        return None, {"ok": False, "error": "cart_lookup_failed", "message": "리스트를 확인하지 못해 변경하지 않았습니다."}
    target = explicit if explicit is not None else _GROUP.get()
    if target is not None:
        if any(g["cartGroupId"] == target for g in owned):
            return target, None
        return None, {"ok": False, "error": "invalid_group", "message": "이 리스트를 사용할 수 없습니다. 다른 리스트에 대신 담지 마세요."}
    if len(owned) == 1:
        return owned[0]["cartGroupId"], None
    return None, {"ok": False, "error": "choose_group", "groups": [summary(g) for g in owned],
                  "message": "담을 리스트를 손님에게 확인해 주세요. 임의로 선택하거나 새 리스트를 만들지 마세요."}


def summary(g):
    return {"group_id": g["cartGroupId"], "title": g.get("title") or "장보기 리스트",
            "status": g.get("status"), "item_count": len(g.get("items") or [])}


def check_item(cart_item_id):
    from app import config
    if config.USE_MOCK_SOT:
        return None
    target, error = resolve_group()
    if error:
        return error
    try:
        if any(g["cartGroupId"] == target and any(i.get("cartItemId") == cart_item_id for i in g.get("items", [])) for g in groups()):
            return None
    except Exception:
        return {"ok": False, "error": "cart_lookup_failed"}
    return {"ok": False, "error": "wrong_group_item", "message": "선택된 리스트의 항목이 아닙니다. 해당 리스트를 다시 조회하세요."}


def read_cart(session_id, consumer_id=None):
    from app import sot_client
    owned = groups(consumer_id)
    selected = _GROUP.get()
    active = [g for g in owned if g.get("status") != "COMPLETED"]
    if selected is None and len(active) == 1:
        selected = active[0]["cartGroupId"]
    candidates = [g for g in active if g["cartGroupId"] == selected]
    # A list overview is returned even when there is no selected list.
    rows = [i for g in candidates for i in g.get("items", [])]
    products = {p["sku_id"]: p for p in sot_client.get_products_by_skus(list({i["skuId"] for i in rows}))} if rows else {}
    items = []
    for i in rows:
        p = products.get(i["skuId"], {})
        price = p.get("final_price_krw", p.get("price_krw"))
        items.append({"cart_item_id": i.get("cartItemId"), "sku_id": i["skuId"],
                      "group_id": selected, "name": p.get("name"), "quantity": i["quantity"],
                      "price_krw": price, "line_total_krw": price * i["quantity"] if price is not None else None})
    return {"session_id": session_id, "group_id": selected, "groups": [summary(g) for g in owned],
            "items": items, "total_krw": sum(i["line_total_krw"] for i in items) if all(i["line_total_krw"] is not None for i in items) else None,
            "read_as": "items와 합계는 선택된 리스트만입니다. group_id가 없으면 groups의 제목을 보여주고 어느 리스트인지 확인하세요. 다른 리스트를 명시하면 조회한 group_id를 사용하세요."}
