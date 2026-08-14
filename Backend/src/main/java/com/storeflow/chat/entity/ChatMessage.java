package com.storeflow.chat.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 대화 한 줄. USER(사용자 발화) / AI(사용자 질문에 대한 응답) / AI_PROACTIVE(Agent가 먼저 건 개입 발화)
 * 셋 다 같은 이력에 순서대로 남는다 (요구사항 24번: "챗창을 다시 열면 이어서 보이게").
 */
@Entity
@Table(name = "chat_message")
public class ChatMessage {

    public enum Sender { USER, AI, AI_PROACTIVE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "chat_message_id")
    private Long chatMessageId;

    @Column(name = "chat_session_id", nullable = false)
    private Long chatSessionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "sender", nullable = false, length = 20)
    private Sender sender;

    @Lob
    @Column(name = "content", nullable = false)
    private String content;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected ChatMessage() {}

    public ChatMessage(Long chatSessionId, Sender sender, String content) {
        this.chatSessionId = chatSessionId;
        this.sender = sender;
        this.content = content;
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public Long getChatMessageId() { return chatMessageId; }
    public Long getChatSessionId() { return chatSessionId; }
    public Sender getSender() { return sender; }
    public String getContent() { return content; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}