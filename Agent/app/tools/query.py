from app import sot_client


MAX_SEARCH_RESULTS = 8
MAX_HISTORY_ROWS = 20
MAX_CHANGE_EVENTS = 10

_SEARCH_FIELDS = ("sku_id", "name", "brand", "price_krw", "spec_raw",
                  "category_l1", "category_l2", "lifecycle_status", "on_promo")


def _pick(row: dict, fields: tuple) -> dict:
    return {k: row[k] for k in fields if k in row}


def _search_products(**kw) -> dict:
    rows = sot_client.search_products(**kw)
    total = len(rows)
    trimmed = [_pick(r, _SEARCH_FIELDS) for r in rows[:MAX_SEARCH_RESULTS]]
    return {
        "total_found": total,
        "returned" : len(trimmed),
        "truncated": total > len(trimmed),
        "products": trimmed,
    }

def _get_product(sku_id: int) -> dict:
    row = sot_client.get_products(sku_id)
    if row is None:
        return {"found": False, "sku_id": sku_id}
    return {"found": True, "product": row}

def _get_inventory(sku_id: int) -> dict:
    inv = sot_client.get_inventory(sku_id)
    locs = inv["locations"]
    pick_qty = sum(I["qty"] for I in locs if I["tier_role"] == "PICK")
    other_qty = sum(I["qty"] for I in locs if I["tier_role"] != "PICK")
    return {
        **inv,
        "pick_qty": pick_qty,
        "backup_qty": other_qty,
        "on_shelf": pick_qty > 0,
    }

def _get_purchase_history(member_id: int) -> dict:
    rows = sot_client.get_purchase_history(member_id)
    total = len(rows)
    recent = rows[-MAX_HISTORY_ROWS:]
    return {"member_id": member_id, "total_rows": total,
            "truncated": total > len(recent), "purchases": recent}

def _get_session_cart(session_id: str) -> dict:
    return sot_client.get_session_cart(session_id)

def _get_wishlist(member_id:int) -> dict:
    rows = sot_client.get_wishlist(member_id)
    out = []
    for w in rows:
        p = sot_client.get_products(w["sku_id"])
        out.append({**w, "name": p["name"] if p else None})
    return {"member_id": member_id, "items": out}

def _get_change_events(sku_ids = None, within_hours:int =24) -> dict:
    rows = sot_client.get_change_events(sku_ids=sku_ids, within_hours=within_hours)
    total = len(rows)
    recent = rows[-MAX_CHANGE_EVENTS:]
    return{"total_rows": total, "truncated": total > len(recent), "events": recent}

#===============================================

REGISTRY = {
    "search_products": _search_products,
    "get_product": _get_product,
    "get_inventory": _get_inventory,
    "get_purchase_history": _get_purchase_history,
    "get_session_cart": _get_session_cart,
    "get_wishlist": _get_wishlist,
    "get_change_events": _get_change_events,
}

def run(tool_name: str, tool_input: dict) -> dict:
    fn = REGISTRY.get(tool_name)
    if fn is None:
        return {"error": "unknown_tool", "message": f"'{tool_name}'은 없는 도구 입니다"}

    code = fn.__code__
    if code.co_flags & 0x08:
        clean = tool_input
    else:
        allowed = code.co_varnames[:code.co_argcount]
        clean = {k: v for k, v in tool_input.items() if k in allowed}

    try:
        return fn(**clean)
    except TypeError as e:
        return {"error": "bad_arguments", "message": str(e)}
    except Exception as e:
        return {"error": type(e).__name__, "message": str(e)}