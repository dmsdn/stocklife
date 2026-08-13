"""
재구매 예측 모델 학습용 더미 구매이력 생성 스크립트.

설계 원칙:
- 완전 무작위가 아니라, 소비자 x 상품 조합마다 '고유한 소비주기'를 미리 심어둔다.
  예: 소비자 A는 블루베리를 평균 12일마다, 소비자 B는 20일마다 재구매하는 식.
- 실제 구매일은 그 주기에 정규분포 노이즈를 섞어서 생성한다 (완전 규칙적이면 너무 쉬운 문제가 됨).
- 이렇게 해야 "패턴이 있지만 완벽하진 않은" 현실적인 데이터가 되고,
  베이스라인(단순 평균) vs ML모델의 성능 차이를 의미있게 비교할 수 있다.
"""

import random
import csv
from datetime import date, timedelta

random.seed(42)  # 재현 가능하게 고정 (포트폴리오에서 "왜 이 결과가 나왔는지" 재현 가능해야 함)

NUM_CONSUMERS = 300
SIMULATION_DAYS = 365  # 1년치 데이터

# 실제 서비스 상품 중 재구매가 자연스러운 소모품 위주로 선정
PRODUCTS = [
    {"sku_id": 100001, "name": "네이처팜 대용량 블루베리 1kg", "category": "신선식품-과일채소"},
    {"sku_id": 100002, "name": "리얼푸드 국산 블루베리 1망", "category": "신선식품-과일채소"},
    {"sku_id": 200004, "name": "이지벤트 방충제 스프레이", "category": "캠핑용품-용품"},
]

# 상품별 '평균 재구매 주기(일)' 기준값 - 이 값 주변으로 소비자마다 약간씩 다르게 흩어지게 함
BASE_CYCLE_DAYS = {
    100001: 10,   # 블루베리 - 신선식품이라 비교적 자주 재구매
    100002: 14,
    200004: 45,   # 방충제 - 소모 주기가 긺
}


def generate_consumer_cycle(base_cycle: int) -> float:
    """소비자마다 기준 주기에서 -30%~+30% 범위로 개인차를 부여."""
    variation = random.uniform(0.7, 1.3)
    return base_cycle * variation


def generate_purchase_dates(personal_cycle: float, simulation_days: int, sku_id: int) -> list[date]:
    """
    개인 주기를 기준으로 실제 구매일들을 생성하되, 단순 평균으로는 못 잡는 패턴을 섞는다:
    - drift: 시간이 지날수록 주기가 서서히 짧아지거나(단골화) 길어지는(이탈 조짐) 소비자
    - seasonal: 블루베리(신선식품)는 여름철(6~8월)에 주기가 짧아짐
    - skip: 가끔 한 번 건너뛰었다가 원래 패턴으로 복귀 (평균/표준편차만으론 설명 안 되는 이상치)
    """
    start = date(2025, 1, 1)
    dates = []
    current_offset = random.uniform(0, personal_cycle)

    drift_rate = random.choice([0.0, 0.0, -0.01, 0.01, -0.02])

    purchase_index = 0
    while current_offset < simulation_days:
        purchase_date = start + timedelta(days=int(current_offset))
        dates.append(purchase_date)
        purchase_index += 1

        drifted_cycle = personal_cycle * (1 + drift_rate) ** purchase_index

        month = purchase_date.month
        seasonal_factor = 1.0
        if sku_id in (100001, 100002) and month in (6, 7, 8):
            seasonal_factor = 0.7

        effective_cycle = drifted_cycle * seasonal_factor

        if random.random() < 0.08:
            gap_multiplier = random.uniform(1.8, 2.5)
        else:
            gap_multiplier = 1.0

        noise = random.gauss(0, effective_cycle * 0.15)
        next_gap = max(1, effective_cycle * gap_multiplier + noise)
        current_offset += next_gap

    return dates


def main():
    rows = []

    for consumer_id in range(1, NUM_CONSUMERS + 1):
        # 소비자마다 관심 상품 개수를 다르게 (1~3개 상품을 반복 구매)
        num_products = random.choice([1, 1, 2, 2, 3])  # 1~2개가 더 흔하도록 가중치
        chosen_products = random.sample(PRODUCTS, num_products)

        for product in chosen_products:
            base_cycle = BASE_CYCLE_DAYS[product["sku_id"]]
            personal_cycle = generate_consumer_cycle(base_cycle)

            purchase_dates = generate_purchase_dates(personal_cycle, SIMULATION_DAYS, product["sku_id"])

            for purchase_date in purchase_dates:
                rows.append({
                    "consumer_id": consumer_id,
                    "sku_id": product["sku_id"],
                    "product_name": product["name"],
                    "purchase_date": purchase_date.isoformat(),
                    "quantity": random.choice([1, 1, 1, 2]),  # 대부분 1개, 가끔 2개
                })

    rows.sort(key=lambda r: (r["consumer_id"], r["sku_id"], r["purchase_date"]))

    output_path = "dummy_purchase_history.csv"
    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["consumer_id", "sku_id", "product_name", "purchase_date", "quantity"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"생성된 구매 기록 수: {len(rows)}건")
    print(f"저장 위치: {output_path}")

    # 간단한 검증용 통계 출력
    consumer_product_pairs = set((r["consumer_id"], r["sku_id"]) for r in rows)
    print(f"소비자-상품 조합 수: {len(consumer_product_pairs)}개")
    avg_purchases_per_pair = len(rows) / len(consumer_product_pairs)
    print(f"조합당 평균 구매 횟수: {avg_purchases_per_pair:.1f}회")


if __name__ == "__main__":
    main()
