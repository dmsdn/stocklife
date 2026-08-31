package com.storeflow.cart.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;

public class CreateCartGroupRequest {
    @NotBlank
    private String title;
    private String description;

    // 장 볼 날짜(선택). 미입력 시 null 그대로 저장 — 날짜 없이도 리스트 생성 가능해야 함.
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate shoppingDate;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public LocalDate getShoppingDate() { return shoppingDate; }
    public void setShoppingDate(LocalDate shoppingDate) { this.shoppingDate = shoppingDate; }
}