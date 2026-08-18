package com.storeflow.chat.service;

import com.storeflow.chat.dto.*;
import com.storeflow.chat.entity.ChatMessage;
import com.storeflow.chat.entity.ChatSession;
import com.storeflow.chat.repository.ChatMessageRepository;
import com.storeflow.chat.repository.ChatSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.*;

/**
 * 채팅 세션/이력의 Source of Truth는 Spring Boot.
 * AI 판단과 Claude 호출은 Agent(FastAPI)가 담당한다.
 */
@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final RestTemplate restTemplate;

    @Value("${agent.base-url}")
    private String agentBaseUrl;

    public ChatService(ChatSessionRepository chatSessionRepository,
                       ChatMessageRepository chatMessageRepository,
                       RestTemplate restTemplate) {
        this.chatSessionRepository = chatSessionRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.restTemplate = restTemplate;
    }

    /**
     * ChatGPT의 "새 채팅"에 해당.
     * sessionId는 백엔드가 UUID로 발급한다.
     *
     * 로그인 사용자: consumerId로 소유권 구분
     * 비회원: X-Chat-Client-Id 값(anonymousId)으로 소유권 구분
     */
    @Transactional
    public ChatSessionResponse createSession(Long consumerIdOrNull, String anonymousIdOrNull) {
        requireOwnerIdentity(consumerIdOrNull, anonymousIdOrNull);

        String sessionId = UUID.randomUUID().toString();

        ChatSession session = new ChatSession(
                sessionId,
                consumerIdOrNull,
                consumerIdOrNull == null ? normalizeAnonymousId(anonymousIdOrNull) : null
        );

        return ChatSessionResponse.from(chatSessionRepository.save(session));
    }

    /**
     * ChatGPT 좌측 사이드바의 "채팅 목록"에 해당.
     */
    @Transactional(readOnly = true)
    public List<ChatSessionResponse> getSessions(Long consumerIdOrNull, String anonymousIdOrNull) {
        requireOwnerIdentity(consumerIdOrNull, anonymousIdOrNull);

        List<ChatSession> sessions =
                consumerIdOrNull != null
                        ? chatSessionRepository.findByConsumerIdOrderByUpdatedAtDesc(consumerIdOrNull)
                        : chatSessionRepository.findByAnonymousIdOrderByUpdatedAtDesc(
                        normalizeAnonymousId(anonymousIdOrNull)
                );

        return sessions.stream()
                .map(ChatSessionResponse::from)
                .toList();
    }

    /**
     * 특정 채팅방 메타데이터 조회.
     */
    @Transactional(readOnly = true)
    public ChatSessionResponse getSession(String sessionId,
                                          Long consumerIdOrNull,
                                          String anonymousIdOrNull) {
        ChatSession session = getOwnedSession(sessionId, consumerIdOrNull, anonymousIdOrNull, false);
        return ChatSessionResponse.from(session);
    }

    /**
     * 과거 채팅방을 열 때 전체 메시지를 시간순으로 반환.
     */
    @Transactional(readOnly = true)
    public List<ChatMessageResponse> getMessages(String sessionId,
                                                 Long consumerIdOrNull,
                                                 String anonymousIdOrNull) {
        ChatSession session = getOwnedSession(sessionId, consumerIdOrNull, anonymousIdOrNull, false);

        return chatMessageRepository
                .findByChatSessionIdOrderByCreatedAtAsc(session.getChatSessionId())
                .stream()
                .map(ChatMessageResponse::from)
                .toList();
    }

    /**
     * 기존 /api/chat 릴레이.
     * 같은 sessionId로 다시 호출하면 해당 채팅의 최근 문맥을 Agent에 전달하므로
     * 과거 채팅창을 다시 열어 계속 대화할 수 있다.
     */
    @Transactional
    public ChatResponse relay(ChatRequest request,
                              Long consumerIdOrNull,
                              String anonymousIdOrNull) {

        ChatSession session = getOrCreateOwnedSession(
                request.getSessionId(), consumerIdOrNull, anonymousIdOrNull
        );

        List<ChatMessage> recent = chatMessageRepository
                .findTop20ByChatSessionIdOrderByCreatedAtDesc(session.getChatSessionId());
        Collections.reverse(recent);

        List<AgentChatRequest.HistoryTurn> history = new ArrayList<>();
        for (ChatMessage message : recent) {
            String role =
                    message.getSender() == ChatMessage.Sender.USER
                            ? "user"
                            : "assistant";

            history.add(new AgentChatRequest.HistoryTurn(role, message.getContent()));
        }

        // 첫 사용자 발화를 채팅방 제목으로 사용.
        // 너무 길면 사이드바 표시용으로 40자까지만 저장.
        session.setTitleIfEmpty(makeTitle(request.getMessage()));
        session.touch();
        chatSessionRepository.save(session);

        chatMessageRepository.save(
                new ChatMessage(
                        session.getChatSessionId(),
                        ChatMessage.Sender.USER,
                        request.getMessage()
                )
        );

        AgentChatRequest agentRequest = new AgentChatRequest(
                request.getSessionId(),
                consumerIdOrNull,
                request.getMessage(),
                history
        );

        AgentChatResponse agentResponse;
        String reply;

        try {
            agentResponse = restTemplate.postForObject(
                    agentBaseUrl + "/agent/chat",
                    agentRequest,
                    AgentChatResponse.class
            );

            reply =
                    agentResponse != null && agentResponse.getReply() != null
                            ? agentResponse.getReply()
                            : "지금 답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요.";

        } catch (RestClientException e) {
            log.error("Agent 서버 호출 실패 (sessionId={})", request.getSessionId(), e);
            agentResponse = null;
            reply = "지금 답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요.";
        }

        chatMessageRepository.save(
                new ChatMessage(
                        session.getChatSessionId(),
                        ChatMessage.Sender.AI,
                        reply
                )
        );

        session.touch();
        chatSessionRepository.save(session);

        List<Map<String, Object>> actions =
                agentResponse != null && agentResponse.getActions() != null
                        ? agentResponse.getActions()
                        : Collections.emptyList();

        return new ChatResponse(reply, actions);
    }

    /**
     * Agent가 먼저 건 개입 발화(AI_PROACTIVE)를 이력에 저장.
     *
     * 호출 주체가 사용자가 아니라 Agent(서버 대 서버)이므로 소유권 검사(authorizeAndMaybeClaim)는
     * 하지 않는다 — Agent는 X-Internal-Service-Key로 이미 인증됐다.
     * 세션이 없으면 만들지 않고 그대로 실패시킨다: 개입 발화는 반드시 기존 세션(장보기 세션과
     * 함께 시작된 채팅방)에 붙어야 하고, 여기서 새 세션을 만들면 사용자가 채팅창을 열었을 때
     * 엉뚱한 빈 방이 하나 더 보이게 된다.
     */
    @Transactional
    public ChatMessageResponse saveProactiveMessage(String sessionId, String content) {
        ChatSession session = chatSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new NoSuchElementException("채팅 세션을 찾을 수 없습니다."));

        ChatMessage saved = chatMessageRepository.save(
                new ChatMessage(
                        session.getChatSessionId(),
                        ChatMessage.Sender.AI_PROACTIVE,
                        content
                )
        );

        session.touch();
        chatSessionRepository.save(session);

        return ChatMessageResponse.from(saved);
    }

    /**
     * 기존 클라이언트 호환:
     * POST /api/chat으로 처음 보는 sessionId가 바로 들어와도 세션을 생성한다.
     *
     * 다만 새 프론트에서는 POST /api/chat/sessions로 먼저 생성하는 것을 권장.
     */
    private ChatSession getOrCreateOwnedSession(String sessionId,
                                                Long consumerIdOrNull,
                                                String anonymousIdOrNull) {

        Optional<ChatSession> existing = chatSessionRepository.findBySessionId(sessionId);

        if (existing.isPresent()) {
            return authorizeAndMaybeClaim(
                    existing.get(),
                    consumerIdOrNull,
                    anonymousIdOrNull,
                    true
            );
        }

        String anonymousId =
                consumerIdOrNull == null
                        ? normalizeAnonymousIdNullable(anonymousIdOrNull)
                        : null;

        return chatSessionRepository.save(
                new ChatSession(sessionId, consumerIdOrNull, anonymousId)
        );
    }

    private ChatSession getOwnedSession(String sessionId,
                                        Long consumerIdOrNull,
                                        String anonymousIdOrNull,
                                        boolean allowClaim) {

        ChatSession session = chatSessionRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new NoSuchElementException("채팅 세션을 찾을 수 없습니다."));

        return authorizeAndMaybeClaim(
                session,
                consumerIdOrNull,
                anonymousIdOrNull,
                allowClaim
        );
    }

    /**
     * 소유권 규칙
     *
     * 1) consumer_id가 있는 방:
     *    같은 로그인 사용자만 접근 가능.
     *
     * 2) anonymous_id가 있는 방:
     *    같은 X-Chat-Client-Id만 접근 가능.
     *    같은 브라우저에서 로그인한 경우 allowClaim=true이면 로그인 계정으로 귀속 가능.
     *
     * 3) 둘 다 NULL인 과거 legacy 방:
     *    sessionId를 가진 기존 클라이언트 호환을 위해 접근을 허용한다.
     */
    private ChatSession authorizeAndMaybeClaim(ChatSession session,
                                               Long consumerIdOrNull,
                                               String anonymousIdOrNull,
                                               boolean allowClaim) {

        if (session.getConsumerId() != null) {
            if (!Objects.equals(session.getConsumerId(), consumerIdOrNull)) {
                throw new SecurityException("이 채팅 세션에 접근할 권한이 없습니다.");
            }
            return session;
        }

        if (session.getAnonymousId() != null) {
            String anonymousId = normalizeAnonymousIdNullable(anonymousIdOrNull);

            if (!Objects.equals(session.getAnonymousId(), anonymousId)) {
                throw new SecurityException("이 채팅 세션에 접근할 권한이 없습니다.");
            }

            if (allowClaim && consumerIdOrNull != null) {
                session.claimByConsumer(consumerIdOrNull);
                return chatSessionRepository.save(session);
            }

            return session;
        }

        // migration 이전에 만들어진 legacy 세션.
        return session;
    }

    private void requireOwnerIdentity(Long consumerIdOrNull, String anonymousIdOrNull) {
        if (consumerIdOrNull == null && normalizeAnonymousIdNullable(anonymousIdOrNull) == null) {
            throw new IllegalArgumentException(
                    "비회원 채팅에서는 X-Chat-Client-Id 헤더가 필요합니다."
            );
        }
    }

    private String normalizeAnonymousId(String anonymousId) {
        String normalized = normalizeAnonymousIdNullable(anonymousId);
        if (normalized == null) {
            throw new IllegalArgumentException(
                    "비회원 채팅에서는 X-Chat-Client-Id 헤더가 필요합니다."
            );
        }
        return normalized;
    }

    private String normalizeAnonymousIdNullable(String anonymousId) {
        if (anonymousId == null) {
            return null;
        }

        String normalized = anonymousId.trim();
        if (normalized.isEmpty()) {
            return null;
        }

        if (normalized.length() > 64) {
            throw new IllegalArgumentException(
                    "X-Chat-Client-Id는 64자를 초과할 수 없습니다."
            );
        }

        return normalized;
    }

    private String makeTitle(String message) {
        if (message == null) {
            return null;
        }

        String oneLine = message.replaceAll("\\s+", " ").trim();

        if (oneLine.length() <= 40) {
            return oneLine;
        }

        return oneLine.substring(0, 40) + "…";
    }
}