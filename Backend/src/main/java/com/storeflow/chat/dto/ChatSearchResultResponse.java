package com.storeflow.chat.dto;

import java.util.List;

/**
 * 3번(대화 내용 검색) 결과: 세션 단위로 묶어서, 그 세션 안에서 검색어와 매칭된
 * 메시지 중 최근 5개만 스니펫으로 담는다. 프론트는 매칭 메시지 하나를 클릭하면
 * GET /api/chat/sessions/{sessionId}/messages로 들어가서 그 messageId로 스크롤 이동하면 됨.
 * 하이라이트 표시는 프론트가 keyword로 직접 처리(백엔드는 원문 그대로 내려줌).
 */
public class ChatSearchResultResponse {

    private final String sessionId;
    private final String title;
    private final Long groupId; // 이 세션이 묶인 장보기 리스트 id (없으면 null)
    private final List<ChatMessageResponse> matches; // 최신순, 최대 5개

    public ChatSearchResultResponse(String sessionId, String title, Long groupId, List<ChatMessageResponse> matches) {
        this.sessionId = sessionId;
        this.title = title;
        this.groupId = groupId;
        this.matches = matches;
    }

    public String getSessionId() { return sessionId; }
    public String getTitle() { return title; }
    public Long getGroupId() { return groupId; }
    public List<ChatMessageResponse> getMatches() { return matches; }
}