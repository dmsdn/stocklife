package com.storeflow.chat.dto;

import java.util.List;
import java.util.Map;

public class ChatResponse {

    private final String reply;

    // Agent가 도중에 실행한 액션 로그 (예: add_to_cart 결과). 그대로 프론트에 넘겨서 화면 갱신에 쓰게 함.
    private final List<Map<String, Object>> actions;

    public ChatResponse(String reply, List<Map<String, Object>> actions) {
        this.reply = reply;
        this.actions = actions;
    }

    public String getReply() { return reply; }
    public List<Map<String, Object>> getActions() { return actions; }
}