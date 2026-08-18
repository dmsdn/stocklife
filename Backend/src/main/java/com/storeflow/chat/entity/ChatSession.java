package com.storeflow.chat.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 채팅방 하나 = 장보기 세션(session_id) 하나에 연결.
 * 비회원도 대화 가능하므로 memberId(=consumerId)는 nullable.
 * session_id는 consumer_events.session_id와 같은 값 체계를 쓴다 (매장 내 행동 이벤트와 대화를 같은 축으로 묶기 위함).
 */
@Entity
@Table(name = "chat_session")
public class ChatSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "chat_session_id")
    private Long chatSessionId;

    @Column(name = "session_id", nullable = false, length = 64)
    private String sessionId;

    // 비회원이면 null. 회원이면 consumer_id 연결.
    @Column(name = "consumer_id")
    private Long consumerId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected ChatSession() {}

    public ChatSession(String sessionId, Long consumerId) {
        this.sessionId = sessionId;
        this.consumerId = consumerId;
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public Long getChatSessionId() { return chatSessionId; }
    public String getSessionId() { return sessionId; }
    public Long getConsumerId() { return consumerId; }
}