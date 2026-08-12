"""기존 storeflow_reviews_seed.csv(comment/reviewer_name)를
   새 스키마(body/author_masked/created_at)로 변환."""

import csv
import random
from datetime import datetime, timedelta

SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임"]

with open("storeflow_reviews_seed.csv", encoding="utf-8-sig") as f:
    rows = list(csv.DictReader(f))

out_rows = []
for r in rows:
    created = datetime(2026, 1, 1) + timedelta(days=random.randint(0, 220),
                                                seconds=random.randint(0, 86400))
    out_rows.append({
        "review_id": r["review_id"],
        "sku_id": r["sku_id"],
        "rating": r["rating"],
        "body": r["comment"],
        "author_masked": f"{random.choice(SURNAMES)}**",
        "created_at": created.strftime("%Y-%m-%d %H:%M:%S.000"),
    })

with open("storeflow_reviews_seed_v2.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=["review_id", "sku_id", "rating", "body", "author_masked", "created_at"])
    w.writeheader()
    w.writerows(out_rows)

print(f"{len(out_rows)}개 변환 완료 -> storeflow_reviews_seed_v2.csv")