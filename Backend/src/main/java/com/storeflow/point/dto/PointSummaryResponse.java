package com.storeflow.point.dto;

import java.util.List;

public class PointSummaryResponse {
    private final int balance;
    private final int earnedThisMonth;
    private final int usedThisMonth;
    private final int earningRatePercent;
    private final List<PointHistoryResponse> history;

    public PointSummaryResponse(int balance, int earnedThisMonth, int usedThisMonth,
                                int earningRatePercent, List<PointHistoryResponse> history) {
        this.balance = balance;
        this.earnedThisMonth = earnedThisMonth;
        this.usedThisMonth = usedThisMonth;
        this.earningRatePercent = earningRatePercent;
        this.history = history;
    }

    public int getBalance() { return balance; }
    public int getEarnedThisMonth() { return earnedThisMonth; }
    public int getUsedThisMonth() { return usedThisMonth; }
    public int getEarningRatePercent() { return earningRatePercent; }
    public List<PointHistoryResponse> getHistory() { return history; }
}