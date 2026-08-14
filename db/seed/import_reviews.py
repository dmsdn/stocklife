"""
storeflow_reviews_seed.csv 를 MySQL reviews 테이블에 넣는 스크립트.
같은 폴더에 storeflow_reviews_seed.csv가 있어야 함.
"""

import pandas as pd
from sqlalchemy import create_engine

DB_USER = "root"
DB_PASSWORD = "1234"
DB_HOST = "localhost"
DB_PORT = 3307
DB_NAME = "storeflow_db"

engine = create_engine(
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

df = pd.read_csv("storeflow_reviews_seed.csv")
print(f"CSV에서 {len(df)}개 행을 읽었습니다.")

df.to_sql("reviews", con=engine, if_exists="append", index=False)
print("reviews 테이블에 저장 완료.")

with engine.connect() as conn:
    result = conn.exec_driver_sql("SELECT COUNT(*) FROM reviews")
    print("현재 reviews 테이블 행 수:", result.scalar())