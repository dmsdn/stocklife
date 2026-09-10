"""Attach durable detail links from owned SoT results, not model-invented IDs."""
import re


def with_references(reply, ledgers):
    refs = {}
    def add(prefix, key, label):
        if isinstance(key, int) and not isinstance(key, bool) and key > 0:
            safe = re.sub(r"[\[\]\\\r\n]", " ", str(label)).strip()[:100]
            refs[f"{prefix}/{key}"] = safe
    for entry in ledgers.get("sot", []):
        result = entry.get("result") or {}
        if not isinstance(result, dict) or result.get("error"):
            continue
        if entry.get("tool") in ("get_session_cart", "get_wishlist"):
            for g in result.get("groups", []):
                add("/saved", g.get("group_id"), g.get("title") or "장보기 리스트")
        if entry.get("tool") == "get_purchase_history":
            for o in result.get("orders", []):
                names = [i.get("productName") for i in o.get("items", []) if i.get("productName")]
                label = f"{str(o.get('ordered_at') or '')[:10]} 구매내역"
                if names:
                    label += f" · {names[0]}" + (f" 외 {len(names)-1}종" if len(names) > 1 else "")
                add("/mypage/orders", o.get("order_id"), label)
    # Discard guessed internal links; public web links retain ordinary text semantics.
    reply = re.sub(r"\[([^\]]+)\]\((/[^)]+)\)",
                   lambda m: m.group(0) if m.group(2) in refs else m.group(1), reply)
    lines = [f"- [{label}]({href})" for href, label in list(refs.items())[:8] if f"]({href})" not in reply]
    return reply + ("\n\n관련 내역 바로가기\n" + "\n".join(lines) if lines else "")
