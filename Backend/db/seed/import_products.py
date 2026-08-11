"""
storeflow_products_seed_5000.csv 를 MySQL products 테이블에 넣는 스크립트.

사전 준비:
  1) docker compose up -d 로 MySQL이 떠 있어야 함
  2) schema.sql로 products 테이블이 미리 생성되어 있어야 함
  3) Backend 가상환경(.venv) 활성화된 상태에서 아래 패키지 설치:
       pip install pandas sqlalchemy pymysql

실행:
  python import_products.py
"""

import pandas as pd
from sqlalchemy import create_engine

# .env로 빼기 전 로컬 개발용 - 값은 docker-compose.yml과 동일하게 맞춰둠
DB_USER = "root"
DB_PASSWORD = "1234"
DB_HOST = "localhost"
DB_PORT = 3307
DB_NAME = "storeflow_db"

CSV_PATH = "storeflow_products_seed_5000.csv"

engine = create_engine(
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

df = pd.read_csv(CSV_PATH)
print(f"CSV에서 {len(df)}개 행을 읽었습니다.")

df.to_sql("products", con=engine, if_exists="append", index=False)
print("products 테이블에 저장 완료.")

# 확인
with engine.connect() as conn:
    result = conn.exec_driver_sql("SELECT COUNT(*) FROM products")
    print("현재 products 테이블 행 수:", result.scalar())