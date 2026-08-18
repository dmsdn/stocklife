package com.storeflow.chat.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * 채팅방 하나.
 *
 * - session_id: 외부에서 사용하는 공개 식별자(UUID 권장)
 * - consumer_id: 로그인 사용자 소유 채팅이면 값 존재
 * - anonymous_id: 비회원 브라우저/앱 소유 채팅이면 값 존재
 *
 * consumer_id와 anonymous_id는 동시에 필수는 아니지만,
 * 새 세션 API로 생성하는 세션은 둘 중 하나로 소유권을 식별한다.
 */
@Entity
@Table(name = "chat_session")
public class ChatSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "chat_session_id")
    private Long chatSessionId;

    @Column(name = "session_id", nullable = false, length = 64, unique = true)
    private String sessionId;

    @Column(name = "consumer_id")
    private Long consumerId;

    @Column(name = "anonymous_id", length = 64)
    private String anonymousId;

    @Column(name = "title", length = 120)
    private String title;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected ChatSession() {}

    public ChatSession(String sessionId, Long consumerId, String anonymousId) {
        this.sessionId = sessionId;
        this.consumerId = consumerId;
        this.anonymousId = anonymousId;
    }

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public void touch() {
        this.updatedAt = LocalDateTime.now();
    }

    public void setTitleIfEmpty(String title) {
        if ((this.title == null || this.title.isBlank()) && title != null && !title.isBlank()) {
            this.title = title;
        }
    }

    /**
     * 비회원으로 만든 채팅을 같은 브라우저에서 로그인한 뒤 이어갈 때 사용.
     * anonymousId가 일치하는 경우에만 Service에서 호출한다.
     */
    public void claimByConsumer(Long consumerId) {
        this.consumerId = consumerId;
        this.anonymousId = null;
        touch();
    }

    public Long getChatSessionId() { return chatSessionId; }
    public String getSessionId() { return sessionId; }
    public Long getConsumerId() { return consumerId; }
    public String getAnonymousId() { return anonymousId; }
    public String getTitle() { return title; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}