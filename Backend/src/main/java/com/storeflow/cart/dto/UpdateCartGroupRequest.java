package com.storeflow.cart.dto;

/** 리스트 이름/설명 수정. 둘 다 선택값이라 null이면 해당 필드는 그대로 둔다. */
public class UpdateCartGroupRequest {
    private String title;
    private String description;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}