"""
용량/수량에 비례하지 않던 가격을 다시 계산해서 DB를 직접 업데이트한다.
상품명·카테고리·브랜드·단위는 그대로 두고 price_krw만 바꾼다.
"""

import re
import random
from sqlalchemy import create_engine, text

DB_USER = "root"
DB_PASSWORD = "1234"
DB_HOST = "localhost"
DB_PORT = 3307
DB_NAME = "storeflow_db"

engine = create_engine(
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# 카테고리별 "기본 단가" 범위 (단위: g/ml당 원, 또는 개당 원)
BASE_PRICE_RANGE = {
    "신선식품-과일채소": (2.5, 6),      # 원/g
    "신선식품-정육수산": (15, 35),      # 원/g
    "가공식품-간편식": (300, 1200),     # 원/개(count)
    "음료주류": (1.5, 5),               # 원/ml
    "생활용품-세제욕실": (50, 300),     # 원/개(count)
    "주방용품": (5000, 25000),          # 원/개(count)
    "가전": (30000, 350000),            # 원/대
    "의류패션잡화": (8000, 40000),      # 원/개
    "계절레저용품": (5000, 60000),      # 원/개
    "완구문구": (3000, 30000),          # 원/개
    "반려동물용품": (3000, 8000),       # 원/g(사료류 kg 기준 환산) → 개는 별도
    "건강뷰티": (300, 3000),            # 원/개
    "사무공구": (1000, 15000),          # 원/개
}


def parse_unit(unit: str):
    """unit 문자열에서 (총수량, 축) 을 뽑는다. 축: weight(g)/volume(ml)/count(개)"""
    if not unit:
        return 1, "count"

    mult = 1
    m = re.search(r"x\s*(\d+)", unit)
    base = unit
    if m:
        mult = int(m.group(1))
        base = unit[: m.start()]

    wv = re.search(r"(\d+(?:\.\d+)?)\s*(kg|g|L|ml)", base)
    if wv:
        val, u = float(wv.group(1)), wv.group(2)
        grams = val * 1000 if u in ("kg", "L") else val
        axis = "weight" if u in ("kg", "g") else "volume"
        return grams * mult, axis

    paren = re.search(r"\((\d+(?:\.\d+)?)(kg|g|L|ml)\)", unit)
    if paren:
        val, u = float(paren.group(1)), paren.group(2)
        grams = val * 1000 if u in ("kg", "L") else val
        axis = "weight" if u in ("kg", "g") else "volume"
        return grams, axis

    cnt = re.search(r"(\d+)\s*(입|롤|매|장|켤레|세트|정|인분|대|망|p|개)", unit)
    if cnt:
        return int(cnt.group(1)) * mult, "count"

    return 1 * mult, "count"


def main():
    random.seed(42)  # 아이템별 기준단가를 매번 같게 유지 (재실행해도 동일 결과)

    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT sku_id, name, category, unit FROM products")
        ).mappings().all()

    print(f"{len(rows)}개 상품 가격 재계산 시작")

    # "품목 기준단가"를 브랜드·수식어와 무관하게 이름 뒷부분(품목명)별로 고정
    item_base_price = {}
    updates = []

    for row in rows:
        category = row["category"]
        qty, axis = parse_unit(row["unit"])
        lo, hi = BASE_PRICE_RANGE.get(category, (500, 3000))

        # 이름에서 "브랜드 + 수식어"를 뺀 나머지를 품목 키로 사용 (일관된 기준단가를 위해)
        name_key = re.sub(r"^\S+\s+", "", row["name"])  # 첫 단어(브랜드) 제거
        name_key = re.sub(r"\d.*$", "", name_key).strip()  # 뒤쪽 규격 숫자 제거

        key = (category, name_key)
        if key not in item_base_price:
            item_base_price[key] = random.uniform(lo, hi)
        base_unit_price = item_base_price[key]

        # 대용량일수록 단위가격이 5~15% 저렴해지는 보정 (수량이 클수록 할인율 커짐, 로그 스케일)
        import math
        bulk_discount = max(0.85, 1 - min(0.15, math.log10(max(qty, 1)) * 0.03))

        brand_multiplier = random.uniform(0.85, 1.25)

        if axis == "count" and category == "가전":
            # 가전은 '대' 단위라 수량 곱연산 없이 그대로
            price = base_unit_price * brand_multiplier
        else:
            price = base_unit_price * qty * brand_multiplier * bulk_discount

        price = max(500, round(price / 100) * 100)  # 최소 500원, 100원 단위 반올림
        updates.append({"sku_id": row["sku_id"], "price_krw": int(price)})

    with engine.connect() as conn:
        for u in updates:
            conn.execute(
                text("UPDATE products SET price_krw = :price_krw WHERE sku_id = :sku_id"),
                u,
            )
        conn.commit()

    print(f"{len(updates)}개 상품 가격 업데이트 완료")


if __name__ == "__main__":
    main()