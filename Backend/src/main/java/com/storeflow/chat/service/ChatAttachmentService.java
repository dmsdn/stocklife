package com.storeflow.chat.service;

import com.storeflow.chat.entity.ChatAttachment;
import com.storeflow.chat.entity.ChatAttachmentType;
import com.storeflow.chat.entity.ChatSession;
import com.storeflow.chat.repository.ChatAttachmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Set;

@Service
public class ChatAttachmentService {

    // 카메라/갤러리 사진, 영수증 사진은 여기, 일반 파일(DOCUMENT)은 별도 한도.
    private static final long MAX_IMAGE_BYTES = 10L * 1024 * 1024;      // 10MB
    private static final long MAX_DOCUMENT_BYTES = 20L * 1024 * 1024;   // 20MB

    private static final Set<String> ALLOWED_IMAGE_CONTENT_TYPES =
            Set.of("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif");

    private static final Set<String> ALLOWED_DOCUMENT_CONTENT_TYPES =
            Set.of("application/pdf",
                    "application/msword",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "application/vnd.ms-excel",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    private final ObjectStorageService objectStorageService;
    private final ChatAttachmentRepository chatAttachmentRepository;

    public ChatAttachmentService(ObjectStorageService objectStorageService,
                                 ChatAttachmentRepository chatAttachmentRepository) {
        this.objectStorageService = objectStorageService;
        this.chatAttachmentRepository = chatAttachmentRepository;
    }

    /**
     * 업로드 1건 처리. 이 시점엔 아직 어떤 메시지에도 안 붙는다(chatMessageId=null) —
     * 메시지 전송 시 ChatService.relay가 linkToMessage로 연결한다.
     * 세션 소유권 검증은 컨트롤러가 ChatService.getOwnedSessionForAttachment로 먼저 하고
     * 그 결과(session)를 여기로 넘겨받는다 — 이 서비스는 소유권을 모른다.
     */
    @Transactional
    public ChatAttachment upload(ChatSession session, ChatAttachmentType type,
                                 Long uploadedByConsumerIdOrNull, MultipartFile file) {

        validate(type, file);

        ObjectStorageService.UploadResult result;
        try {
            result = objectStorageService.upload(
                    file.getInputStream(), file.getSize(), file.getContentType(),
                    file.getOriginalFilename()
            );
        } catch (IOException e) {
            throw new UncheckedIOException("업로드할 파일을 읽는 중 오류가 발생했습니다.", e);
        }

        ChatAttachment attachment = new ChatAttachment(
                session.getChatSessionId(),
                type,
                file.getOriginalFilename() == null ? "file" : file.getOriginalFilename(),
                result.storageKey(),
                result.url(),
                file.getContentType(),
                file.getSize(),
                uploadedByConsumerIdOrNull
        );

        return chatAttachmentRepository.save(attachment);
    }

    /**
     * 메시지 전송 시 호출 — 업로드만 되어있던 첨부들을 실제 메시지에 연결한다.
     * chatSessionId가 다르거나 이미 다른 메시지에 붙은(재사용 시도) 건은 조용히 무시한다 —
     * 다른 사람의 첨부 id를 끼워 넣는 시도를 막는 최소한의 방어.
     */
    @Transactional
    public void linkToMessage(List<Long> attachmentIds, Long chatSessionId, Long chatMessageId) {
        if (attachmentIds == null || attachmentIds.isEmpty()) {
            return;
        }

        List<ChatAttachment> attachments =
                chatAttachmentRepository.findByChatAttachmentIdInAndChatMessageIdIsNull(attachmentIds);

        for (ChatAttachment attachment : attachments) {
            if (!attachment.getChatSessionId().equals(chatSessionId)) {
                continue;
            }
            attachment.attachTo(chatMessageId);
        }

        chatAttachmentRepository.saveAll(attachments);
    }

    private void validate(ChatAttachmentType type, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("업로드할 파일이 비어있습니다.");
        }

        String contentType = file.getContentType();

        switch (type) {
            case IMAGE, RECEIPT -> {
                if (contentType == null || !ALLOWED_IMAGE_CONTENT_TYPES.contains(contentType)) {
                    throw new IllegalArgumentException("이미지 파일(jpg/png/webp/heic)만 업로드할 수 있습니다.");
                }
                if (file.getSize() > MAX_IMAGE_BYTES) {
                    throw new IllegalArgumentException("이미지는 10MB 이하만 업로드할 수 있습니다.");
                }
            }
            case DOCUMENT -> {
                if (contentType == null || !ALLOWED_DOCUMENT_CONTENT_TYPES.contains(contentType)) {
                    throw new IllegalArgumentException("PDF/Word/Excel 파일만 업로드할 수 있습니다.");
                }
                if (file.getSize() > MAX_DOCUMENT_BYTES) {
                    throw new IllegalArgumentException("파일은 20MB 이하만 업로드할 수 있습니다.");
                }
            }
        }
    }
}