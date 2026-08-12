package com.storeflow.consumer.entity;

public enum Grade {
    BASIC(0),
    BRONZE(50_000),
    SILVER(100_000),
    GOLD(150_000);

    private final int threshold;

    Grade(int threshold) {
        this.threshold = threshold;
    }

    public int getThreshold() {
        return threshold;
    }

    // 이번 달 누적 결제 금액을 받아서 해당하는 등급을 계산
    public static Grade calculateFrom(int monthlySpendAmount) {
        if (monthlySpendAmount >= GOLD.threshold) return GOLD;
        if (monthlySpendAmount >= SILVER.threshold) return SILVER;
        if (monthlySpendAmount >= BRONZE.threshold) return BRONZE;
        return BASIC;
    }
};