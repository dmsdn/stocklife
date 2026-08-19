package com.storeflow.chat.dto;

import com.storeflow.chat.entity.ChatMessage;

import java.time.LocalDateTime;

public class ChatMessageResponse {

    private final Long messageId;
    private final String sender;
    private final String content;
    private final LocalDateTime createdAt;

    public ChatMessageResponse(Long messageId,
                               String sender,
                               String content,
                               LocalDateTime createdAt) {
        this.messageId = messageId;
        this.sender = sender;
        this.content = content;
        this.createdAt = createdAt;
    }

    public static ChatMessageResponse from(ChatMessage message) {
        return new ChatMessageResponse(
                message.getChatMessageId(),
                message.getSender().name(),
                message.getContent(),
                message.getCreatedAt()
        );
    }

    public Long getMessageId() { return messageId; }
    public String getSender() { return sender; }
    public String getContent() { return content; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}