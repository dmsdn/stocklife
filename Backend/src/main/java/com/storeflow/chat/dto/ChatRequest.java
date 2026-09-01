package com.storeflow.chat.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

public class ChatRequest {

    // 장보기 세션 식별자. 비회원도 프론트가 발급해서 들고 있는 값 (consumer_events.session_id와 동일 체계).
    @NotBlank
    private String sessionId;

    @NotBlank
    private String message;

    // 이 메시지에 붙일 첨부파일 id들. POST /api/chat/sessions/{sessionId}/attachments 로
    // 먼저 업로드해서 받은 attachmentId를 여기 담아 보내면 이 메시지에 연결된다. 없으면 null/빈 배열.
    private List<Long> attachmentIds;

    public ChatRequest() {}

    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public List<Long> getAttachmentIds() { return attachmentIds; }
    public void setAttachmentIds(List<Long> attachmentIds) { this.attachmentIds = attachmentIds; }
}