//package com.storeflow.chat.controller;
//
//import com.storeflow.chat.dto.ChatAttachmentResponse;
//import com.storeflow.chat.entity.ChatAttachment;
//import com.storeflow.chat.entity.ChatAttachmentType;
//import com.storeflow.chat.entity.ChatSession;
//import com.storeflow.chat.service.ChatAttachmentService;
//import com.storeflow.chat.service.ChatService;
//import com.storeflow.global.jwt.ConsumerJwtUtil;
//import org.springframework.http.ResponseEntity;
//import org.springframework.web.bind.annotation.*;
//import org.springframework.web.multipart.MultipartFile;
//
//import java.io.UncheckedIOException;
//import java.util.NoSuchElementException;
//
///**
// * 챗 첨부파일(카메라/갤러리/파일/영수증) 업로드 API.
// * 흐름: (1) 이 API로 파일을 먼저 올려서 attachmentId를 받고 프론트에서 미리보기를 띄운다 →
// * (2) 실제 채팅 전송(POST /api/chat)에 attachmentIds를 같이 실어 보내면 그 메시지에 연결된다.
// */
//@RestController
//@RequestMapping("/api/chat/sessions/{sessionId}/attachments")
//public class ChatAttachmentController {
//
//    private final ChatAttachmentService chatAttachmentService;
//    private final ChatService chatService;
//    private final ConsumerJwtUtil jwtUtil;
//
//    public ChatAttachmentController(ChatAttachmentService chatAttachmentService,
//                                    ChatService chatService,
//                                    ConsumerJwtUtil jwtUtil) {
//        this.chatAttachmentService = chatAttachmentService;
//        this.chatService = chatService;
//        this.jwtUtil = jwtUtil;
//    }
//
//    /**
//     * 파일 업로드. multipart/form-data로 file(파일)과 type(IMAGE/DOCUMENT/RECEIPT)을 받는다.
//     * 카메라 촬영/갤러리 선택은 프론트에서 둘 다 type=IMAGE로 보내면 되고(백엔드는 출처를 구분하지 않음),
//     * 영수증 스캔 화면에서 올리는 것만 type=RECEIPT로 구분해서 보내면 된다.
//     */
//    @PostMapping
//    public ResponseEntity<?> upload(
//            @PathVariable String sessionId,
//            @RequestParam ChatAttachmentType type,
//            @RequestParam("file") MultipartFile file,
//            @RequestHeader(value = "Authorization", required = false) String authorization,
//            @RequestHeader(value = "X-Chat-Client-Id", required = false) String anonymousId
//    ) {
//        try {
//            Long consumerId = resolveConsumerIdOrNull(authorization);
//            ChatSession session = chatService.getOwnedSessionForAttachment(sessionId, consumerId, anonymousId);
//
//            ChatAttachment attachment = chatAttachmentService.upload(session, type, consumerId, file);
//
//            return ResponseEntity.ok(ChatAttachmentResponse.from(attachment));
//
//        } catch (NoSuchElementException e) {
//            return ResponseEntity.status(404).body(e.getMessage());
//        } catch (SecurityException e) {
//            return ResponseEntity.status(403).body(e.getMessage());
//        } catch (IllegalArgumentException e) {
//            return ResponseEntity.badRequest().body(e.getMessage());
//        } catch (UncheckedIOException | IllegalStateException e) {
//            return ResponseEntity.status(502).body(e.getMessage());
//        }
//    }
//
//    private Long resolveConsumerIdOrNull(String authorization) {
//        if (authorization == null || authorization.isBlank()) {
//            return null;
//        }
//        if (!authorization.startsWith("Bearer ")) {
//            throw new SecurityException("Authorization 헤더 형식이 올바르지 않습니다.");
//        }
//        String token = authorization.substring(7);
//        if (!jwtUtil.validateToken(token)) {
//            throw new SecurityException("유효하지 않은 인증 토큰입니다.");
//        }
//        return jwtUtil.getConsumerIdFromToken(token);
//    }
//}