package com.storeflow.consumer.entity;

public enum Grade {
    BASIC(0),
    // 기존 기준은 "이번 달 결제 금액(원)" 기준 50,000/100,000/150,000였다.
    // 포인트 적립률 2%를 적용해 그대로 환산한 값(원 * 0.02)으로 재조정함:
    //   50,000원 * 0.02 = 1,000P / 100,000원 * 0.02 = 2,000P / 150,000원 * 0.02 = 3,000P
    // 주의: 예전엔 "매달 리셋되는 한 달 지출액" 기준이었지만, 지금은 "평생 누적 적립 포인트"
    // 기준이라 절대적인 난이도가 달라졌다(한 달 안에 다시 채워야 했던 걸 평생 한 번만 넘으면 됨).
    // 등급 체계를 그대로 유지할지, 누적 기준에 맞게 문턱값을 더 높일지는 기획 확인 필요.
    BRONZE(1_000),
    SILVER(2_000),
    GOLD(3_000);

    private final int threshold;

    Grade(int threshold) {
        this.threshold = threshold;
    }

    public int getThreshold() {
        return threshold;
    }

    // 누적 적립 포인트를 받아서 해당하는 등급을 계산 (더 이상 "이번 달" 개념 아님 — 평생 누적)
    public static Grade calculateFrom(int accumulatedPoints) {
        if (accumulatedPoints >= GOLD.threshold) return GOLD;
        if (accumulatedPoints >= SILVER.threshold) return SILVER;
        if (accumulatedPoints >= BRONZE.threshold) return BRONZE;
        return BASIC;
    }
};