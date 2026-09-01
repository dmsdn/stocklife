package com.storeflow.chat.repository;

import com.storeflow.chat.entity.ChatAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatAttachmentRepository extends JpaRepository<ChatAttachment, Long> {

    /** 특정 메시지에 붙은 첨부파일들(메시지 목록 응답에 같이 내려줄 때 사용). */
    List<ChatAttachment> findByChatMessageId(Long chatMessageId);

    /** 여러 메시지를 한 번에 조회할 때(N+1 방지) — 세션 전체 메시지 조회 시 사용. */
    List<ChatAttachment> findByChatMessageIdIn(List<Long> chatMessageIds);

    /** 업로드했지만 아직 메시지에 안 붙은(전송 전) 첨부 — 소유권 확인 후 연결(attachTo)할 때 조회. */
    List<ChatAttachment> findByChatAttachmentIdInAndChatMessageIdIsNull(List<Long> chatAttachmentIds);
}