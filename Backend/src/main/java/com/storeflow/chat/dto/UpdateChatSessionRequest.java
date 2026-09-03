package com.storeflow.chat.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** PATCH /api/chat/sessions/{sessionId} 바디. */
public class UpdateChatSessionRequest {
    @NotBlank
    @Size(max = 120)
    private String title;

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
}