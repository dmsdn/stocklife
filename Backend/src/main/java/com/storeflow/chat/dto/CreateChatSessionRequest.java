package com.storeflow.chat.dto;

/**
 * 새 채팅 생성 요청 바디. 전부 선택값이라 바디 없이 호출해도 된다(홈 화면 등 일반 대화).
 * groupId가 있으면 "이 장보기 리스트 얘기"로 시작된 대화로 묶인다 — 리스트 화면의
 * "AI에게 물어보기" 버튼에서만 채워서 보내면 됨.
 */
public class CreateChatSessionRequest {
    private Long groupId;

    public Long getGroupId() { return groupId; }
    public void setGroupId(Long groupId) { this.groupId = groupId; }
}