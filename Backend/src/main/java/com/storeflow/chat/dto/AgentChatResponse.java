package com.storeflow.chat.dto;

import java.util.List;
import java.util.Map;

/** Agent(/agent/chat) 응답 바디. Agent가 만든 자연어 응답과 도구 실행 로그만 받는다. */
public class AgentChatResponse {

    private String reply;
    private List<Map<String, Object>> actions;

    public AgentChatResponse() {}

    public String getReply() { return reply; }
    public void setReply(String reply) { this.reply = reply; }
    public List<Map<String, Object>> getActions() { return actions; }
    public void setActions(List<Map<String, Object>> actions) { this.actions = actions; }
}