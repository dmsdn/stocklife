package com.storeflow.chat.service;

import com.storeflow.cart.entity.CartGroup;
import com.storeflow.cart.repository.CartGroupRepository;
import com.storeflow.chat.dto.*;
import com.storeflow.chat.entity.ChatAttachment;
import com.storeflow.chat.entity.ChatMessage;
import com.storeflow.chat.entity.ChatSession;
import com.storeflow.chat.repository.ChatAttachmentRepository;
import com.storeflow.chat.repository.ChatMessageRepository;
import com.storeflow.chat.repository.ChatSessionRepository;
import com.storeflow.realtime.service.EventBroadcastService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 채팅 세션/이력의 Source of Truth는 Spring Boot.
 * AI 판단과 Claude 호출은 Agent(FastAPI)가 담당한다.
 */
@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ChatAttachmentRepository chatAttachmentRepository;
    private final RestTemplate restTemplate;
    private final EventBroadcastService eventBroadcastService;
    private final CartGroupRepository cartGroupRepository;

    @Value("${agent.base-url}")
    private String agentBaseUrl;

    public ChatService(ChatSessionRepository chatSessionRepository,
                       ChatMessageRepository chatMessageRepository,
                       ChatAttachmentRepository chatAttachmentRepository,
                       RestTemplate restTemplate,
                       EventBroadcastService eventBroadcastService,
                       CartGroupRepository cartGroupRepository) {
        this.chatSessionRepository = chatSessionRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.chatAttachmentRepository = chatAttachmentRepository;
        this.restTemplate = restTemplate;
        this.eventBroadcastService = eventBroadcastService;
        this.cartGroupRepository = cartGroupRepository;
    }

    /**
     * ChatGPT의 "새 채팅"에 해당.
     * sessionId는 백엔드가 UUID로 발급한다.
     *
     * 로그인 사용자: consumerId로 소유권 구분
     * 비회원: X-Chat-Client-Id 값(anonymousId)으로 소유권 구분
     *
     * groupIdOrNull: 장보기 리스트 화면에서 시작된 대화면 그 리스트(cart_group) id.
     * 홈 화면 등 일반 대화면 null로 두면 지금처럼 동작한다. 비회원이거나 본인 소유가
     * 아닌 groupId가 오면 조용히 무시(null 처리)한다 — 리스트 자체가 회원 전용 기능이라
     * 이 때문에 채팅 시작 자체를 막을 이유는 없다.
     */
    @Transactional
    public ChatSessionResponse createSession(Long consumerIdOrNull, String anonymousIdOrNull, Long groupIdOrNull) {
        requireOwnerIdentity(consumerIdOrNull, anonymousIdOrNull);

        String sessionId = UUID.randomUUID().toString();
        Long ownedGroupId = resolveOwnedGroupIdOrNull(consumerIdOrNull, groupIdOrNull);

        ChatSession session = new ChatSession(
                sessionId,
                consumerIdOrNull,
                consumerIdOrNull == null ? normalizeAnonymousId(anonymousIdOrNull) : null,
                ownedGroupId
        );

        return ChatSessionResponse.from(chatSessionRepository.save(session));
    }

    /** groupId가 있어도 로그인 상태가 아니거나 본인 리스트가 아니면 null로 무시한다. */
    private Long resolveOwnedGroupIdOrNull(Long consumerIdOrNull, Long groupIdOrNull) {
        if (groupIdOrNull == null || consumerIdOrNull == null) {
            return null;
        }
        return cartGroupRepository.findByCartGroupIdAndConsumerId(groupIdOrNull, consumerIdOrNull)
                .map(CartGroup::getCartGroupId)
                .orElse(null);
    }

    /**
     * 3번(대화 내용 검색): 검색어가 포함된 메시지를 세션 단위로 묶어서, 세션별
     * 최근 매칭 5개 + 세션 메타(title, groupId)를 반환한다. 세션 목록은 이 사용자
     * 소유인 것만 대상으로 하고(로그인/비회원 소유권 규칙은 getSessions와 동일),
     * 결과는 "가장 최근에 매칭된 메시지가 있는 세션" 순으로 정렬한다.
     */
    @Transactional(readOnly = true)
    public List<ChatSearchResultResponse> searchMessages(Long consumerIdOrNull,
                                                         String anonymousIdOrNull,
                                                         String keyword) {
        requireOwnerIdentity(consumerIdOrNull, anonymousIdOrNull);

        if (keyword == null || keyword.isBlank()) {
            return List.of();
        }
        String trimmedKeyword = keyword.trim();

        List<ChatSession> ownedSessions =
                consumerIdOrNull != null
                        ? chatSessionRepository.findByConsumerIdOrderByUpdatedAtDesc(consumerIdOrNull)
                        : chatSessionRepository.findByAnonymousIdOrderByUpdatedAtDesc(
                        normalizeAnonymousId(anonymousIdOrNull)
                );

        if (ownedSessions.isEmpty()) {
            return List.of();
        }

        Map<Long, ChatSession> sessionsByPk = new HashMap<>();
        List<Long> sessionPks = new ArrayList<>();
        for (ChatSession session : ownedSessions) {
            sessionsByPk.put(session.getChatSessionId(), session);
            sessionPks.add(session.getChatSessionId());
        }

        List<ChatMessage> matched =
                chatMessageRepository.searchByKeywordInSessions(sessionPks, trimmedKeyword);

        // chatSessionId별로 묶되, 입력 순서(= createdAt 내림차순)를 그대로 유지해서
        // 세션당 앞의 5개만 남긴다.
        LinkedHashMap<Long, List<ChatMessage>> grouped = new LinkedHashMap<>();
        for (ChatMessage message : matched) {
            List<ChatMessage> bucket = grouped.computeIfAbsent(message.getChatSessionId(), k -> new ArrayList<>());
            if (bucket.size() < 5) {
                bucket.add(message);
            }
        }

        return grouped.entrySet().stream()
                .map(entry -> {
                    ChatSession session = sessionsByPk.get(entry.getKey());
                    List<ChatMessageResponse> messages = entry.getValue().stream()
                            .map(ChatMessageResponse::from)
                            .toList();
                    return new ChatSearchResultResponse(
                            session.getSessionId(),
                            session.getTitle(),
                            session.getGroupId(),
                            messages
                    );
                })
                // grouped는 이미 "가장 최근 매칭 메시지가 처음 나온 순서"대로 쌓였으므로 그대로 최신순.
                .toList();
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
     * 첨부파일(카메라/갤러리/파일/영수증)은 메시지별로 따로 조회하면 N+1이 나므로
     * 세션의 첨부를 한 번에 가져와 messageId 기준으로 묶어서 붙인다.
     */
    @Transactional(readOnly = true)
    public List<ChatMessageResponse> getMessages(String sessionId,
                                                 Long consumerIdOrNull,
                                                 String anonymousIdOrNull) {
        ChatSession session = getOwnedSession(sessionId, consumerIdOrNull, anonymousIdOrNull, false);

        List<ChatMessage> messages = chatMessageRepository
                .findByChatSessionIdOrderByCreatedAtAsc(session.getChatSessionId());

        List<Long> messageIds = messages.stream().map(ChatMessage::getChatMessageId).toList();

        Map<Long, List<ChatAttachmentResponse>> attachmentsByMessageId =
                chatAttachmentRepository.findByChatMessageIdIn(messageIds).stream()
                        .map(ChatAttachmentResponse::from)
                        .collect(Collectors.groupingBy(ChatAttachmentResponse::getChatMessageId));

        return messages.stream()
                .map(m -> ChatMessageResponse.from(
                        m, attachmentsByMessageId.getOrDefault(m.getChatMessageId(), List.of())))
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

        ChatMessage userMessage = chatMessageRepository.save(
                new ChatMessage(
                        session.getChatSessionId(),
                        ChatMessage.Sender.USER,
                        request.getMessage()
                )
        );

        // 첨부(카메라/갤러리/파일/영수증)를 먼저 업로드해두고 attachmentIds로 실어 보낸 경우,
        // 방금 만든 사용자 메시지에 연결한다. 업로드 API에서 세션 소유권은 이미 확인했지만,
        // 여기서도 chatSessionId 일치 여부를 한 번 더 걸러(linkToMessage 내부) 다른 세션의
        // 첨부가 섞여 들어오지 않게 한다.
        if (request.getAttachmentIds() != null && !request.getAttachmentIds().isEmpty()) {
            List<ChatAttachment> pending = chatAttachmentRepository
                    .findByChatAttachmentIdInAndChatMessageIdIsNull(request.getAttachmentIds());
            for (ChatAttachment attachment : pending) {
                if (attachment.getChatSessionId().equals(session.getChatSessionId())) {
                    attachment.attachTo(userMessage.getChatMessageId());
                }
            }
            chatAttachmentRepository.saveAll(pending);
        }

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

        // 요구사항 22: 저장과 동시에 프론트 실시간 채널로도 말풍선을 밀어준다.
        // 프론트가 챗창을 닫아뒀어도(구독자 없음) EventBroadcastService가 조용히 버리므로 안전하고,
        // 다음에 챗창을 열면 어차피 getMessages()(24번, DB 조회)로 이 메시지를 다시 보게 된다.
        eventBroadcastService.pushToFrontend(
                sessionId,
                "chat_message",
                Map.of(
                        "messageId", saved.getChatMessageId(),
                        "sender", saved.getSender().name(),
                        "content", saved.getContent(),
                        "createdAt", saved.getCreatedAt().toString()
                )
        );

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
     * 첨부파일 업로드 API(ChatAttachmentController)에서 쓰는 소유권 검증 창구.
     * getOwnedSession은 private이라 다른 컨트롤러/서비스에서 세션 소유권만 확인하고 싶을 때
     * 이 메서드를 통해 재사용한다. allowClaim=false — 첨부 업로드로 세션 소유권이 바뀌면 안 됨.
     */
    public ChatSession getOwnedSessionForAttachment(String sessionId,
                                                    Long consumerIdOrNull,
                                                    String anonymousIdOrNull) {
        return getOwnedSession(sessionId, consumerIdOrNull, anonymousIdOrNull, false);
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