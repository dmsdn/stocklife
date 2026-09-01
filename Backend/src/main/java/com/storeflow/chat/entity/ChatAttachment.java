package com.storeflow.chat.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * 채팅에 첨부한 파일 1건(카메라/갤러리/파일/영수증).
 *
 * chat_message_id는 nullable이다 — 프론트 흐름상 "먼저 업로드해서 미리보기를 띄우고,
 * 사용자가 전송 버튼을 눌러야 실제 메시지가 생성"되는 경우가 있어서, 업로드 시점에는
 * 아직 어떤 메시지에 붙을지 모른다. 메시지 전송 시 chatMessageId를 채워 연결한다(attachTo).
 * 전송 없이 방치된(30분 이상 chat_message_id가 NULL인) 행은 배치로 정리 대상.
 */
@Entity
@Table(name = "chat_attachment")
public class ChatAttachment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "chat_attachment_id")
    private Long chatAttachmentId;

    @Column(name = "chat_session_id", nullable = false)
    private Long chatSessionId;

    @Column(name = "chat_message_id")
    private Long chatMessageId;

    @Enumerated(EnumType.STRING)
    @Column(name = "type", nullable = false, length = 20)
    private ChatAttachmentType type;

    @Column(name = "original_filename", nullable = false)
    private String originalFilename;

    // NCP Object Storage 안의 object key(경로). 버킷명은 포함하지 않는다.
    @Column(name = "storage_key", nullable = false, length = 512)
    private String storageKey;

    // 프론트가 바로 <img src>로 쓸 수 있는 공개 URL.
    @Column(name = "url", nullable = false, length = 1024)
    private String url;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;

    @Column(name = "uploaded_by_consumer_id")
    private Long uploadedByConsumerId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected ChatAttachment() {}

    public ChatAttachment(Long chatSessionId, ChatAttachmentType type, String originalFilename,
                          String storageKey, String url, String contentType, long sizeBytes,
                          Long uploadedByConsumerId) {
        this.chatSessionId = chatSessionId;
        this.type = type;
        this.originalFilename = originalFilename;
        this.storageKey = storageKey;
        this.url = url;
        this.contentType = contentType;
        this.sizeBytes = sizeBytes;
        this.uploadedByConsumerId = uploadedByConsumerId;
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    /** 메시지 전송 시 호출 — 업로드만 되어있던 첨부를 실제 메시지에 연결한다. */
    public void attachTo(Long chatMessageId) {
        this.chatMessageId = chatMessageId;
    }

    public Long getChatAttachmentId() { return chatAttachmentId; }
    public Long getChatSessionId() { return chatSessionId; }
    public Long getChatMessageId() { return chatMessageId; }
    public ChatAttachmentType getType() { return type; }
    public String getOriginalFilename() { return originalFilename; }
    public String getStorageKey() { return storageKey; }
    public String getUrl() { return url; }
    public String getContentType() { return contentType; }
    public long getSizeBytes() { return sizeBytes; }
    public Long getUploadedByConsumerId() { return uploadedByConsumerId; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}