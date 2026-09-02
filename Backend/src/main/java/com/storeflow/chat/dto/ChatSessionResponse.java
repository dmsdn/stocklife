package com.storeflow.chat.dto;

import com.storeflow.chat.entity.ChatSession;

import java.time.LocalDateTime;

public class ChatSessionResponse {

    private final String sessionId;
    private final String title;
    private final Long groupId; // 이 리스트(cart_group)에 묶인 세션이면 값 존재, 일반 대화면 null
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;

    public ChatSessionResponse(String sessionId,
                               String title,
                               Long groupId,
                               LocalDateTime createdAt,
                               LocalDateTime updatedAt) {
        this.sessionId = sessionId;
        this.title = title;
        this.groupId = groupId;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public static ChatSessionResponse from(ChatSession session) {
        return new ChatSessionResponse(
                session.getSessionId(),
                session.getTitle(),
                session.getGroupId(),
                session.getCreatedAt(),
                session.getUpdatedAt()
        );
    }

    public String getSessionId() { return sessionId; }
    public String getTitle() { return title; }
    public Long getGroupId() { return groupId; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}