package com.storeflow.chat.dto;

import com.storeflow.chat.entity.ChatMessage;

import java.time.LocalDateTime;
import java.util.List;

public class ChatMessageResponse {

    private final Long messageId;
    private final String sender;
    private final String content;
    private final LocalDateTime createdAt;
    private final List<ChatAttachmentResponse> attachments;

    public ChatMessageResponse(Long messageId,
                               String sender,
                               String content,
                               LocalDateTime createdAt,
                               List<ChatAttachmentResponse> attachments) {
        this.messageId = messageId;
        this.sender = sender;
        this.content = content;
        this.createdAt = createdAt;
        this.attachments = attachments == null ? List.of() : attachments;
    }

    public static ChatMessageResponse from(ChatMessage message) {
        return from(message, List.of());
    }

    public static ChatMessageResponse from(ChatMessage message, List<ChatAttachmentResponse> attachments) {
        return new ChatMessageResponse(
                message.getChatMessageId(),
                message.getSender().name(),
                message.getContent(),
                message.getCreatedAt(),
                attachments
        );
    }

    public Long getMessageId() { return messageId; }
    public String getSender() { return sender; }
    public String getContent() { return content; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public List<ChatAttachmentResponse> getAttachments() { return attachments; }
}