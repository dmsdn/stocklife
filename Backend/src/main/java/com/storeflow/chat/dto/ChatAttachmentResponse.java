package com.storeflow.chat.dto;

import com.storeflow.chat.entity.ChatAttachment;

import java.time.LocalDateTime;

public class ChatAttachmentResponse {

    private final Long attachmentId;
    private final Long chatMessageId; // 아직 메시지에 안 붙었으면 null
    private final String type;
    private final String originalFilename;
    private final String url;
    private final String contentType;
    private final long sizeBytes;
    private final LocalDateTime createdAt;

    public ChatAttachmentResponse(Long attachmentId, Long chatMessageId, String type,
                                  String originalFilename, String url, String contentType,
                                  long sizeBytes, LocalDateTime createdAt) {
        this.attachmentId = attachmentId;
        this.chatMessageId = chatMessageId;
        this.type = type;
        this.originalFilename = originalFilename;
        this.url = url;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.createdAt = createdAt;
    }

    public static ChatAttachmentResponse from(ChatAttachment a) {
        return new ChatAttachmentResponse(
                a.getChatAttachmentId(),
                a.getChatMessageId(),
                a.getType().name(),
                a.getOriginalFilename(),
                a.getUrl(),
                a.getContentType(),
                a.getSizeBytes(),
                a.getCreatedAt()
        );
    }

    public Long getAttachmentId() { return attachmentId; }
    public Long getChatMessageId() { return chatMessageId; }
    public String getType() { return type; }
    public String getOriginalFilename() { return originalFilename; }
    public String getUrl() { return url; }
    public String getContentType() { return contentType; }
    public long getSizeBytes() { return sizeBytes; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}