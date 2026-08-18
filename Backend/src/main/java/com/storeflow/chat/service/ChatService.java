package com.storeflow.chat.service;

import com.storeflow.chat.dto.AgentChatRequest;
import com.storeflow.chat.dto.AgentChatResponse;
import com.storeflow.chat.dto.ChatRequest;
import com.storeflow.chat.dto.ChatResponse;
import com.storeflow.chat.entity.ChatMessage;
import com.storeflow.chat.entity.ChatSession;
import com.storeflow.chat.repository.ChatMessageRepository;
import com.storeflow.chat.repository.ChatSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 요구사항 25번: 흐름은 프론트 -> 백엔드 /api/chat -> Agent /agent/chat -> 응답 반환.
 * 이 서비스가 하는 일 세 가지뿐:
 *   1) 세션 확인 (없으면 생성 - 비회원도 가능)
 *   2) 이력에서 최근 대화를 꺼내 Agent에 같이 전달
 *   3) Agent 응답을 이력에 저장하고 반환
 * AI 판단/Claude 호출은 전부 Agent 쪽 책임. 여기엔 anthropic 라이브러리도, Claude 키도 없다.
 */
@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);
    private static final int HISTORY_TURN_LIMIT = 20;

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

    public ChatResponse relay(ChatRequest request, Long consumerIdOrNull) {
        ChatSession session = getOrCreateSession(request.getSessionId(), consumerIdOrNull);

        List<ChatMessage> recent = chatMessageRepository
                .findTop20ByChatSessionIdOrderByCreatedAtDesc(session.getChatSessionId());
        Collections.reverse(recent); // 오래된 순으로 뒤집어서 Agent에 전달

        List<AgentChatRequest.HistoryTurn> history = new ArrayList<>();
        for (ChatMessage m : recent) {
            String role = (m.getSender() == ChatMessage.Sender.USER) ? "user" : "assistant";
            history.add(new AgentChatRequest.HistoryTurn(role, m.getContent()));
        }

        // 1) 사용자 발화 먼저 저장 (Agent 호출이 실패하더라도 사용자가 뭘 물었는지는 남아야 함)
        chatMessageRepository.save(
                new ChatMessage(session.getChatSessionId(), ChatMessage.Sender.USER, request.getMessage())
        );

        // 2) Agent 호출 - 판단/Claude API 호출은 전부 저 너머에서 일어난다
        // ★ 실패해도(네트워크 끊김, Agent 500, 타임아웃 등) 여기서 예외를 그대로 던지지 않는다.
        //   USER 메시지는 이미 저장됐는데 AI 응답만 안 남으면, 이력이 USER:AI = N:M로
        //   비대칭이 되고 다음 턴에 Agent가 받는 history 순서도 꼬인다. 실패도 하나의 턴 결과로
        //   남겨서 대칭을 유지한다.
        AgentChatRequest agentRequest = new AgentChatRequest(
                request.getSessionId(), consumerIdOrNull, request.getMessage(), history
        );

        AgentChatResponse agentResponse;
        String reply;
        try {
            agentResponse = restTemplate.postForObject(
                    agentBaseUrl + "/agent/chat", agentRequest, AgentChatResponse.class
            );
            reply = (agentResponse != null && agentResponse.getReply() != null)
                    ? agentResponse.getReply()
                    : "지금 답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요.";
        } catch (RestClientException e) {
            log.error("Agent 서버 호출 실패 (sessionId={})", request.getSessionId(), e);
            agentResponse = null;
            reply = "지금 답변을 가져오지 못했어요. 잠시 후 다시 시도해주세요.";
        }

        // 3) AI 응답(또는 실패 메시지) 저장 - 성공/실패 관계없이 항상 USER 한 번에 AI 한 번 남긴다
        chatMessageRepository.save(
                new ChatMessage(session.getChatSessionId(), ChatMessage.Sender.AI, reply)
        );

        List<java.util.Map<String, Object>> actions =
                (agentResponse != null && agentResponse.getActions() != null)
                        ? agentResponse.getActions()
                        : Collections.emptyList();

        return new ChatResponse(reply, actions);
    }

    private ChatSession getOrCreateSession(String sessionId, Long consumerIdOrNull) {
        return chatSessionRepository.findBySessionId(sessionId)
                .orElseGet(() -> chatSessionRepository.save(new ChatSession(sessionId, consumerIdOrNull)));
    }
}