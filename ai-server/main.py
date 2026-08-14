"""
StoreFlow AI - 데이터/AI 백엔드 (본인 담당)

지금까지 붙인 것:
  1) 헬스체크
  2) 상품 조회 (목록/상세 + 평균 별점)
  3) 상품 등록 / 수정 / 비활성화 (관리자 화면은 없지만 API는 필요)
  4) 이벤트 로그 저장/조회

매장 레이아웃(Zone/Aisle/Shelf)이 아직 확정 전이라, 재고 위치·이동 관련 API는
레이아웃 정해진 뒤에 붙일 예정. AI 검색(Claude API 연동)은 다음 단계.
"""

from datetime import datetime

from fastapi import FastAPI, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from ai_search import router as ai_search_router
from ai_agent_shop import router as ai_agent_shop_router
from agent_chat import router as agent_chat_router

app = FastAPI(title="StoreFlow AI - Data/AI Backend")
app.include_router(ai_search_router)
app.include_router(ai_agent_shop_router)
app.include_router(agent_chat_router)

DB_USER = "root"
DB_PASSWORD = "1234"
DB_HOST = "localhost"
DB_PORT = 3307
DB_NAME = "storeflow_db"

engine = create_engine(
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)


@app.get("/")
def health_check():
    return {"status": "ok", "message": "StoreFlow AI data/AI backend is running"}


# ============ 상품 조회 ============

@app.get("/api/products")
def get_products(limit: int = Query(default=20, le=100),
                 category: str | None = None,
                 active_only: bool = True):
    query = "SELECT sku_id, name, category, price_krw, active FROM products WHERE 1=1"
    params = {"limit": limit}
    if category:
        query += " AND category = :category"
        params["category"] = category
    if active_only:
        query += " AND active = TRUE"
    query += " LIMIT :limit"

    with engine.connect() as conn:
        rows = conn.execute(text(query), params).mappings().all()
    return {"count": len(rows), "products": [dict(r) for r in rows]}


@app.get("/api/products/{sku_id}")
def get_product_detail(sku_id: int):
    with engine.connect() as conn:
        product = conn.execute(
            text("SELECT * FROM products WHERE sku_id = :sku_id"),
            {"sku_id": sku_id},
        ).mappings().first()

        if not product:
            raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다")

        rating = conn.execute(
            text("SELECT AVG(rating) AS avg_rating, COUNT(*) AS review_count "
                 "FROM reviews WHERE sku_id = :sku_id"),
            {"sku_id": sku_id},
        ).mappings().first()

    return {
        "product": dict(product),
        "avg_rating": round(float(rating["avg_rating"]), 1) if rating["avg_rating"] else None,
        "review_count": rating["review_count"],
    }


# ============ 상품 등록/수정/비활성화 ============

class ProductCreate(BaseModel):
    name: str
    category: str
    price_krw: int
    unit: str | None = None
    brand: str | None = None
    origin: str | None = None


class ProductUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    price_krw: int | None = None
    unit: str | None = None
    brand: str | None = None
    origin: str | None = None


@app.post("/api/products", status_code=201)
def create_product(body: ProductCreate):
    with engine.connect() as conn:
        next_id = conn.execute(text("SELECT MAX(sku_id) AS max_id FROM products")).scalar()
        new_id = (next_id or 100000) + 1

        conn.execute(
            text("""
                 INSERT INTO products (sku_id, name, category, price_krw, unit, brand, origin, active)
                 VALUES (:sku_id, :name, :category, :price_krw, :unit, :brand, :origin, TRUE)
                 """),
            {"sku_id": new_id, **body.model_dump()},
        )
        conn.execute(
            text("""
                 INSERT INTO event_log (event_type, ref_id, message, created_at)
                 VALUES ('PRODUCT_CREATED', :ref_id, :message, :created_at)
                 """),
            {"ref_id": str(new_id), "message": f"신규 상품 등록: {body.name}",
             "created_at": datetime.utcnow()},
        )
        conn.commit()

    return {"sku_id": new_id, "message": "상품이 등록됐습니다"}


@app.patch("/api/products/{sku_id}")
def update_product(sku_id: int, body: ProductUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(status_code=400, detail="수정할 값이 없습니다")

    set_clause = ", ".join(f"{k} = :{k}" for k in fields)
    fields["sku_id"] = sku_id

    with engine.connect() as conn:
        existing = conn.execute(
            text("SELECT sku_id FROM products WHERE sku_id = :sku_id"), {"sku_id": sku_id}
        ).first()
        if not existing:
            raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다")

        conn.execute(text(f"UPDATE products SET {set_clause} WHERE sku_id = :sku_id"), fields)
        conn.execute(
            text("""
                 INSERT INTO event_log (event_type, ref_id, message, created_at)
                 VALUES ('PRODUCT_UPDATED', :ref_id, :message, :created_at)
                 """),
            {"ref_id": str(sku_id), "message": f"상품 정보 수정: {list(fields.keys())}",
             "created_at": datetime.utcnow()},
        )
        conn.commit()

    return {"message": "상품 정보가 수정됐습니다"}


@app.patch("/api/products/{sku_id}/deactivate")
def deactivate_product(sku_id: int):
    with engine.connect() as conn:
        existing = conn.execute(
            text("SELECT sku_id, name FROM products WHERE sku_id = :sku_id"), {"sku_id": sku_id}
        ).mappings().first()
        if not existing:
            raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다")

        conn.execute(
            text("UPDATE products SET active = FALSE WHERE sku_id = :sku_id"),
            {"sku_id": sku_id},
        )
        conn.execute(
            text("""
                 INSERT INTO event_log (event_type, ref_id, message, created_at)
                 VALUES ('PRODUCT_DEACTIVATED', :ref_id, :message, :created_at)
                 """),
            {"ref_id": str(sku_id), "message": f"상품 판매 중지: {existing['name']}",
             "created_at": datetime.utcnow()},
        )
        conn.commit()

    return {"message": "상품이 비활성화됐습니다"}


# ============ 이벤트 로그 조회 ============

@app.get("/api/events")
def get_events(limit: int = Query(default=50, le=200)):
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT * FROM event_log ORDER BY created_at DESC LIMIT :limit"),
            {"limit": limit},
        ).mappings().all()
    return {"count": len(rows), "events": [dict(r) for r in rows]}