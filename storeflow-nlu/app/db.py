from sqlalchemy import create_engine, text
from app.config import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_pre_ping=True)


def fetch_all_products():
    """
    사전 구축과 상품 매칭에 필요한 최소 컬럼만 조회.
    products 테이블을 읽기 전용으로만 사용 (수정 X - 재고/주문 로직은 Spring Boot 담당).
    """
    query = text("""
        SELECT sku_id, name, category, brand, price_krw, stock_quantity, active
        FROM products
        WHERE active = TRUE
    """)
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()
    return [dict(row) for row in rows]
