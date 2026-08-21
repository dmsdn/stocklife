"""Budget-constrained purpose bundles for StoreFlow.

This module deliberately keeps the arithmetic outside the LLM.  The agent says
what the customer wants (purpose + budget); this module asks Spring Boot for
real products, filters out products with no stock, and chooses at most one
product per need group under the budget.

It lives in ai-server for now so the current /agent/chat path can use it without
changing the new Agent/ harness.  The public function ``optimize_bundle`` is
intentionally shaped so it can later be moved to Agent/app/tools/compute.py.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import backend_client


@dataclass(frozen=True)
class Need:
    key: str
    label: str
    keywords: tuple[str, ...]
    priority: int


# First version: the requested demo scenario.  Priorities express usefulness,
# not price; the solver still decides the combination from real store prices.
CAMPING_NEEDS: tuple[Need, ...] = (
    Need("shelter", "텐트", ("텐트",), 30),
    Need("sleep", "침낭", ("침낭",), 28),
    Need("light", "조명", ("헤드랜턴", "랜턴"), 20),
    Need("cooking", "조리", ("버너",), 18),
    Need("water", "물", ("생수",), 12),
    Need("cooling", "보냉", ("아이스박스",), 10),
    Need("wipes", "위생", ("물티슈",), 8),
    Need("tableware", "식기", ("캠핑 식기 세트",), 7),
    Need("cups", "컵", ("종이컵",), 4),
)

_PURPOSES = {
    "캠핑": CAMPING_NEEDS,
    "camping": CAMPING_NEEDS,
    "캠핑준비": CAMPING_NEEDS,
    "캠핑 준비": CAMPING_NEEDS,
}


def _price(item: dict) -> int | None:
    value = item.get("finalPriceKrw", item.get("priceKrw"))
    try:
        value = int(value)
    except (TypeError, ValueError):
        return None
    return value if value >= 0 else None


def _normalize_product(item: dict, need: Need, inventory: list[dict]) -> dict:
    total_qty = sum(max(0, int(row.get("qty") or 0)) for row in inventory)
    locations = [
        {
            "location_id": row.get("locationId"),
            "tier_role": row.get("tierRole"),
            "floor_no": row.get("floorNo"),
            "x": row.get("x"),
            "y": row.get("y"),
            "qty": int(row.get("qty") or 0),
        }
        for row in inventory
        if int(row.get("qty") or 0) > 0
    ]
    return {
        "need_key": need.key,
        "need": need.label,
        "priority": need.priority,
        "sku_id": item.get("skuId"),
        "name": item.get("name"),
        "brand": item.get("brand"),
        "category_l1": item.get("category") or item.get("categoryL1"),
        "category_l2": item.get("categoryL2"),
        "regular_price_krw": int(item.get("priceKrw") or 0),
        "final_price_krw": _price(item),
        "on_promo": bool(item.get("onPromo", False)),
        "discount_krw": int(item.get("discountKrw") or 0),
        "inventory_total": total_qty,
        "locations": locations[:3],
    }


def _search_stocked_candidates(need: Need, budget_krw: int, per_need: int = 3) -> list[dict]:
    """Find cheap, in-stock candidates for one need using only Backend facts."""
    found: dict[int, dict] = {}

    for keyword in need.keywords:
        result = backend_client.search_products(
            keywords=[keyword],
            category_hints=None,
            max_price=budget_krw,
            sort_by="price_asc",
            limit=8,
        )
        if not result.get("ok"):
            continue

        for item in result.get("data") or []:
            sku_id = item.get("skuId")
            price = _price(item)
            if not sku_id or price is None or price > budget_krw:
                continue
            if item.get("discontinued") or item.get("lifecycleStatus") == "DISCONTINUED":
                continue
            if sku_id in found:
                continue

            inv = backend_client.get_inventory(int(sku_id))
            if not inv.get("ok"):
                continue
            inventory = inv.get("data") or []
            if sum(max(0, int(row.get("qty") or 0)) for row in inventory) <= 0:
                continue

            found[int(sku_id)] = _normalize_product(item, need, inventory)
            if len(found) >= per_need:
                break

        if len(found) >= per_need:
            break

    return sorted(found.values(), key=lambda x: (x["final_price_krw"], x["sku_id"]))[:per_need]


def _better(a: dict, b: dict | None) -> bool:
    """True when state a is preferable to state b.

    Objective order:
      1) higher usefulness score (sum of need priorities)
      2) more distinct needs covered
      3) lower total price (same usefulness -> preserve budget)
    """
    if b is None:
        return True
    ka = (a["score"], len(a["items"]), -a["total_krw"])
    kb = (b["score"], len(b["items"]), -b["total_krw"])
    return ka > kb


def solve_bundle(candidate_groups: Iterable[list[dict]], budget_krw: int, max_items: int = 8) -> dict:
    """Multiple-choice knapsack: choose zero/one candidate from each need group."""
    # total -> best state at exactly that cost.  With <= 9 groups and 3 options
    # each this stays tiny, while avoiding a budget-sized DP array.
    states: dict[int, dict] = {0: {"total_krw": 0, "score": 0, "items": []}}

    for group in candidate_groups:
        next_states = dict(states)  # choosing nothing from this need is allowed
        for state in states.values():
            if len(state["items"]) >= max_items:
                continue
            for item in group:
                cost = state["total_krw"] + int(item["final_price_krw"])
                if cost > budget_krw:
                    continue
                candidate = {
                    "total_krw": cost,
                    "score": state["score"] + int(item["priority"]),
                    "items": state["items"] + [item],
                }
                if _better(candidate, next_states.get(cost)):
                    next_states[cost] = candidate
        states = next_states

    best = None
    for state in states.values():
        if _better(state, best):
            best = state

    return best or {"total_krw": 0, "score": 0, "items": []}


def optimize_bundle(tool_input: dict) -> dict:
    """Tool entry point for purpose/budget shopping.

    Expected input:
      budget_krw: positive integer
      purpose: currently camping/캠핑
      max_items: optional (default 8, max 10)
    """
    try:
        budget_krw = int(tool_input.get("budget_krw"))
    except (TypeError, ValueError):
        return {"ok": False, "error": "budget_krw는 원 단위 정수여야 합니다."}
    if budget_krw <= 0:
        return {"ok": False, "error": "budget_krw는 0보다 커야 합니다."}

    purpose_raw = str(tool_input.get("purpose") or "").strip()
    purpose_key = purpose_raw.replace(" ", "")
    needs = _PURPOSES.get(purpose_raw) or _PURPOSES.get(purpose_key.lower())
    if not needs:
        return {
            "ok": False,
            "error": "unsupported_purpose",
            "message": "현재 목적형 예산 세트는 캠핑부터 지원합니다.",
            "supported_purposes": ["캠핑"],
        }

    try:
        max_items = max(1, min(int(tool_input.get("max_items") or 8), 10))
    except (TypeError, ValueError):
        max_items = 8

    groups: list[list[dict]] = []
    unavailable_needs: list[str] = []
    for need in needs:
        candidates = _search_stocked_candidates(need, budget_krw)
        groups.append(candidates)
        if not candidates:
            unavailable_needs.append(need.label)

    solved = solve_bundle(groups, budget_krw=budget_krw, max_items=max_items)
    selected_keys = {item["need_key"] for item in solved["items"]}
    not_selected = [need.label for need in needs if need.key not in selected_keys]

    # Remove internal scoring fields before exposing results to the LLM.
    public_items = []
    for item in solved["items"]:
        public_items.append({k: v for k, v in item.items() if k not in {"priority", "need_key"}})

    return {
        "ok": True,
        "purpose": "캠핑",
        "budget_krw": budget_krw,
        "total_krw": solved["total_krw"],
        "remaining_krw": budget_krw - solved["total_krw"],
        "item_count": len(public_items),
        "items": public_items,
        "not_selected_needs": not_selected,
        "unavailable_needs": unavailable_needs,
        "note": (
            "매장 Backend에서 조회된 실제 상품 중 재고가 1개 이상인 후보만 사용했고, "
            "예산 안에서 필요도 점수가 가장 높은 조합을 계산했습니다."
        ),
    }
