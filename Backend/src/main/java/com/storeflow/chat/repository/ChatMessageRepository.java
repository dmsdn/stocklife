package com.storeflow.chat.repository;

import com.storeflow.chat.entity.ChatMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    // 챗창을 다시 열 때 이어서 보여주기용: 시간순 전체 조회
    List<ChatMessage> findByChatSessionIdOrderByCreatedAtAsc(Long chatSessionId);

    // Agent에 넘길 "최근 대화"용: 최신 N개를 내림차순으로 가져온 뒤 서비스단에서 뒤집는다
    List<ChatMessage> findTop20ByChatSessionIdOrderByCreatedAtDesc(Long chatSessionId);
}