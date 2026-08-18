package com.storeflow.cart.dto;

import java.util.List;

public class SessionCartResponse {
    private List<SessionCartItemResponse> items;
    private int totalAmount; // 백엔드가 계산 — LLM에게 덧셈 안 시킴 (12번 원칙)

    public SessionCartResponse(List<SessionCartItemResponse> items, int totalAmount) {
        this.items = items;
        this.totalAmount = totalAmount;
    }

    public List<SessionCartItemResponse> getItems() { return items; }
    public int getTotalAmount() { return totalAmount; }
}