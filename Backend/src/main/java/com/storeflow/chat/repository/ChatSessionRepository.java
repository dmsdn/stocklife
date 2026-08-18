package com.storeflow.chat.repository;

import com.storeflow.chat.entity.ChatSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ChatSessionRepository extends JpaRepository<ChatSession, Long> {

    Optional<ChatSession> findBySessionId(String sessionId);

    List<ChatSession> findByConsumerIdOrderByUpdatedAtDesc(Long consumerId);

    List<ChatSession> findByAnonymousIdOrderByUpdatedAtDesc(String anonymousId);
}