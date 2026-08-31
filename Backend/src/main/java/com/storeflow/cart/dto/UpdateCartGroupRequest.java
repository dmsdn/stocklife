package com.storeflow.cart.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDate;

/** 리스트 이름/설명/장 볼 날짜 수정. 전부 선택값이라 null이면 해당 필드는 그대로 둔다. */
public class UpdateCartGroupRequest {
    private String title;
    private String description;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate shoppingDate;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public LocalDate getShoppingDate() { return shoppingDate; }
    public void setShoppingDate(LocalDate shoppingDate) { this.shoppingDate = shoppingDate; }
}