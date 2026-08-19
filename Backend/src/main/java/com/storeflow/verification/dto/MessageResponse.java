// MessageResponse.java — 발송완료/인증완료 등 간단 메시지 응답 공용
package com.storeflow.verification.dto;

public class MessageResponse {
    private final String message;

    public MessageResponse(String message) {
        this.message = message;
    }

    public String getMessage() { return message; }
}