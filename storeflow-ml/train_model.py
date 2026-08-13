"""
재구매 예측 모델 학습 스크립트.

흐름:
1. 원시 구매기록(dummy_purchase_history.csv)을 소비자-상품별 구매 간격 시퀀스로 변환
2. 각 시점마다 '지금까지의 구매 이력'을 피처로, '다음 구매까지 걸린 일수'를 라벨로 하는 학습 샘플 생성
3. 베이스라인(단순 평균 간격으로 예측) 성능 측정
4. RandomForest 회귀모델 학습 후 성능 측정
5. 두 성능을 MAE(평균 절대 오차, 일 단위)로 비교

train/test는 '소비자 ID' 기준으로 분리한다 (행 단위 랜덤 분리 X).
-> 같은 소비자의 이력이 train/test에 걸쳐 섞이면, 모델이 '이미 본 사람'을 맞히는 셈이 되어
   테스트 점수가 부풀려지는 data leakage가 발생하기 때문.
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.model_selection import train_test_split


def build_samples(df: pd.DataFrame) -> pd.DataFrame:
    """소비자-상품별 구매 시퀀스를 순회하며, 매 시점마다 (피처, 라벨) 샘플을 생성."""
    df = df.sort_values(["consumer_id", "sku_id", "purchase_date"])
    samples = []

    grouped = df.groupby(["consumer_id", "sku_id"])

    for (consumer_id, sku_id), group in grouped:
        dates = pd.to_datetime(group["purchase_date"]).tolist()

        if len(dates) < 4:
            continue  # 이력이 너무 적으면(구매 3번 미만 간격) 피처 신뢰도가 낮아 제외

        intervals = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]

        # intervals[0..i-1]까지를 '과거'로 보고, intervals[i]를 예측 대상(라벨)으로 삼는다.
        # 최소 3개 간격(=구매 4번)은 있어야 평균/표준편차가 의미 있어서 i는 3부터 시작.
        for i in range(3, len(intervals)):
            past_intervals = intervals[:i]
            label = intervals[i]

            # 최근 3개 평균 vs 전체 평균 차이 -> drift(주기가 변하는 추세)를 잡기 위한 피처.
            # 단순 평균(avg_interval)만으로는 "최근에 점점 짧아지고 있다" 같은 추세를 못 잡는다.
            recent_avg = np.mean(past_intervals[-3:])
            overall_avg = np.mean(past_intervals)
            recent_trend = recent_avg - overall_avg

            # 예측 시점(다음 구매 예상 시점)의 월 정보 -> 계절성(여름철 블루베리 등)을 잡기 위한 피처
            # intervals[i] = dates[i+1] - dates[i] 이므로, 라벨에 해당하는 실제 구매일은 dates[i+1]
            predicted_next_date = dates[i + 1]
            purchase_month = predicted_next_date.month

            samples.append({
                "consumer_id": consumer_id,
                "sku_id": sku_id,
                "purchase_count": len(past_intervals) + 1,
                "avg_interval": overall_avg,
                "std_interval": np.std(past_intervals),
                "last_interval": past_intervals[-1],
                "min_interval": np.min(past_intervals),
                "max_interval": np.max(past_intervals),
                "recent_trend": recent_trend,
                "purchase_month": purchase_month,
                "label_days_to_next": label,
            })

    return pd.DataFrame(samples)


def main():
    raw = pd.read_csv("dummy_purchase_history.csv")
    print(f"원시 구매기록: {len(raw)}건")

    samples = build_samples(raw)
    print(f"학습 샘플 생성 완료: {len(samples)}개")
    samples.to_csv("training_samples.csv", index=False, encoding="utf-8-sig")
    print("피처/라벨 데이터 저장: training_samples.csv")

    # 소비자 ID 기준으로 train/test 분리 (data leakage 방지)
    unique_consumers = samples["consumer_id"].unique()
    train_consumers, test_consumers = train_test_split(
        unique_consumers, test_size=0.2, random_state=42
    )

    train_df = samples[samples["consumer_id"].isin(train_consumers)]
    test_df = samples[samples["consumer_id"].isin(test_consumers)]
    print(f"\ntrain 샘플: {len(train_df)}개 (소비자 {len(train_consumers)}명)")
    print(f"test  샘플: {len(test_df)}개 (소비자 {len(test_consumers)}명)")

    feature_cols = ["purchase_count", "avg_interval", "std_interval",
                     "last_interval", "min_interval", "max_interval",
                     "recent_trend", "purchase_month"]

    X_train, y_train = train_df[feature_cols], train_df["label_days_to_next"]
    X_test, y_test = test_df[feature_cols], test_df["label_days_to_next"]

    # --- 베이스라인: 그냥 avg_interval을 그대로 예측값으로 사용 ---
    baseline_pred = X_test["avg_interval"]
    baseline_mae = mean_absolute_error(y_test, baseline_pred)

    # --- ML 모델: RandomForest 회귀 ---
    model = RandomForestRegressor(n_estimators=200, max_depth=6, random_state=42)
    model.fit(X_train, y_train)
    model_pred = model.predict(X_test)
    model_mae = mean_absolute_error(y_test, model_pred)

    print("\n=== 성능 비교 (MAE, 낮을수록 좋음) ===")
    print(f"베이스라인 (단순 평균 주기) : {baseline_mae:.2f}일")
    print(f"RandomForest 회귀모델      : {model_mae:.2f}일")

    improvement = (baseline_mae - model_mae) / baseline_mae * 100
    print(f"\n개선율: {improvement:.1f}%")

    # 피처 중요도 (어떤 정보가 예측에 가장 크게 기여했는지)
    print("\n=== 피처 중요도 ===")
    importance = sorted(zip(feature_cols, model.feature_importances_), key=lambda x: -x[1])
    for name, score in importance:
        print(f"  {name}: {score:.3f}")


if __name__ == "__main__":
    main()
