from fastapi import FastAPI
from pydantic import BaseModel

from app.dictionary import product_dictionary
from app.intent import classify_intent, Intent
from app.entity import extract_keywords

app = FastAPI(title="StoreFlow NLU Service")


@app.on_event("startup")
def load_dictionary_on_startup():
    product_dictionary.refresh()
    print(f"[dictionary] 브랜드 {len(product_dictionary.brand_set)}개, "
          f"카테고리 토큰 {len(product_dictionary.category_tokens)}개, "
          f"상품명 토큰 {len(product_dictionary.name_tokens)}개 로드 완료")


class ParseRequest(BaseModel):
    query: str


class MatchedProduct(BaseModel):
    sku_id: int
    name: str
    brand: str | None
    category: str
    price_krw: int
    stock_quantity: int
    in_stock: bool


class ParseResponse(BaseModel):
    intent: Intent
    keywords: list[str]
    matched_products: list[MatchedProduct]
    needs_llm: bool          # True면 규칙 기반으로 해석 실패 -> 나중에 Claude API로 넘길 대상
    reply: str                # 규칙 기반으로 조립한 간단한 응답 문장


def find_products_by_keywords(keywords: list[str]) -> list[dict]:
    if not keywords:
        return []

    results = []
    seen_sku = set()

    for product in product_dictionary.products:
        haystack = f"{product['name']} {product['category']} {product.get('brand') or ''}"
        for keyword in keywords:
            if keyword in haystack and product["sku_id"] not in seen_sku:
                results.append(product)
                seen_sku.add(product["sku_id"])
                break

    return results[:10]  # 너무 많이 매칭되면 상위 10개만


def build_reply(intent: Intent, keywords: list[str], products: list[dict]) -> str:
    if not products:
        if keywords:
            return f"'{', '.join(keywords)}' 관련 상품을 찾지 못했어요."
        return "어떤 상품을 찾으시는지 조금 더 구체적으로 말씀해주세요."

    if intent == Intent.STOCK_CHECK:
        lines = []
        for p in products:
            status = f"재고 {p['stock_quantity']}개 있어요" if p["stock_quantity"] > 0 else "품절이에요"
            lines.append(f"{p['name']} - {status}")
        return "\n".join(lines)

    if intent == Intent.PRICE_CHECK:
        lines = [f"{p['name']} - {p['price_krw']:,}원" for p in products]
        return "\n".join(lines)

    if intent == Intent.RECOMMEND:
        lines = [f"{p['name']} ({p['price_krw']:,}원)" for p in products]
        return "이런 상품은 어떠세요?\n" + "\n".join(lines)

    return "관련 상품을 찾았어요:\n" + "\n".join(p["name"] for p in products)


@app.post("/parse", response_model=ParseResponse)
def parse_query(request: ParseRequest):
    intent = classify_intent(request.query)
    keywords = extract_keywords(request.query)
    matched = find_products_by_keywords(keywords)

    # 의도를 못 잡았거나, 키워드는 있는데 상품을 하나도 못 찾았으면
    # 규칙 기반으로 해석이 어려운 문장 -> 나중에 여기서 Claude API 호출로 넘기면 됨
    needs_llm = (intent == Intent.UNKNOWN) or (keywords and not matched)

    reply = build_reply(intent, keywords, matched)

    return ParseResponse(
        intent=intent,
        keywords=keywords,
        matched_products=[
            MatchedProduct(
                sku_id=p["sku_id"],
                name=p["name"],
                brand=p.get("brand"),
                category=p["category"],
                price_krw=p["price_krw"],
                stock_quantity=p["stock_quantity"],
                in_stock=p["stock_quantity"] > 0,
            )
            for p in matched
        ],
        needs_llm=needs_llm,
        reply=reply,
    )


@app.post("/admin/refresh-dictionary")
def refresh_dictionary():
    """신상품이 추가되는 등 DB가 바뀐 뒤 사전을 다시 구축할 때 호출"""
    product_dictionary.refresh()
    return {
        "status": "refreshed",
        "brand_count": len(product_dictionary.brand_set),
        "category_token_count": len(product_dictionary.category_tokens),
        "name_token_count": len(product_dictionary.name_tokens),
    }


@app.get("/health")
def health():
    return {"status": "ok"}
