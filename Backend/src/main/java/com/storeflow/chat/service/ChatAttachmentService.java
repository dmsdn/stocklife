package com.storeflow.chat.service;

import com.storeflow.chat.entity.*;
import com.storeflow.chat.repository.ChatAttachmentRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.nio.file.*;
import java.io.*;
import java.util.*;

/** Private persistent storage. Retrieval always goes through chat ownership checks. */
@Service
public class ChatAttachmentService {
    private final ChatAttachmentRepository repository;
    private final Path root;
    public ChatAttachmentService(ChatAttachmentRepository repository,
            @Value("${chat.attachments.directory:./chat-uploads}") String directory) {
        this.repository = repository;
        this.root = Path.of(directory).toAbsolutePath().normalize();
    }
    @Transactional
    public ChatAttachment upload(ChatSession session, ChatAttachmentType type, Long owner, MultipartFile file) {
        if (type != ChatAttachmentType.IMAGE && type != ChatAttachmentType.RECEIPT)
            throw new IllegalArgumentException("현재는 JPG·PNG·WebP 사진을 첨부할 수 있어요.");
        if (file.isEmpty() || file.getSize() > 900_000)
            throw new IllegalArgumentException("사진은 900KB 이하로 보내 주세요.");
        try {
            byte[] bytes = file.getBytes();
            String mime = imageType(bytes);
            String key = UUID.randomUUID().toString();
            Path folder = root.resolve(session.getChatSessionId().toString());
            Files.createDirectories(folder);
            Path target = folder.resolve(key);
            Files.write(target, bytes, StandardOpenOption.CREATE_NEW);
            String name = Objects.toString(file.getOriginalFilename(), "사진").replace('\r', ' ').replace('\n', ' ');
            if (name.length() > 200) name = name.substring(0, 200);
            try {
                return repository.saveAndFlush(new ChatAttachment(session.getChatSessionId(), type, name,
                    session.getChatSessionId() + "/" + key,
                    "/api/chat/sessions/" + session.getSessionId() + "/attachments", mime, bytes.length, owner));
            } catch (RuntimeException e) { Files.deleteIfExists(target); throw e; }
        } catch (IOException e) { throw new UncheckedIOException("사진을 저장하지 못했습니다.", e); }
    }
    static String imageType(byte[] b) {
        if (b.length > 3 && (b[0]&255)==255 && (b[1]&255)==216 && (b[2]&255)==255) return "image/jpeg";
        if (b.length > 8 && Arrays.equals(Arrays.copyOf(b,8), new byte[]{(byte)137,80,78,71,13,10,26,10})) return "image/png";
        if (b.length > 12 && new String(b,0,4,java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF")
                && new String(b,8,4,java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP")) return "image/webp";
        throw new IllegalArgumentException("JPG·PNG·WebP 사진으로 다시 선택해 주세요.");
    }
    public ChatAttachment owned(Long session, Long id) {
        ChatAttachment a = repository.findById(id).orElseThrow(NoSuchElementException::new);
        if (!a.getChatSessionId().equals(session)) throw new SecurityException("이 사진을 볼 수 없습니다.");
        return a;
    }
    public String dataUrl(ChatAttachment a) {
        Path file = root.resolve(a.getStorageKey()).normalize();
        if (!file.startsWith(root)) throw new SecurityException("잘못된 사진 경로입니다.");
        try {
            if (Files.size(file) > 900_000) throw new IllegalArgumentException("사진 용량이 너무 큽니다.");
            return "data:" + a.getContentType() + ";base64," + Base64.getEncoder().encodeToString(Files.readAllBytes(file));
        } catch (IOException e) { throw new UncheckedIOException("저장된 사진을 읽지 못했습니다.", e); }
    }
    public void deleteSessionFilesAfterCommit(Long session) {
        org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
            new org.springframework.transaction.support.TransactionSynchronization() {
                @Override public void afterCommit() {
                    Path folder = root.resolve(session.toString());
                    if (!Files.isDirectory(folder)) return;
                    try (var paths = Files.list(folder)) {
                        for (Path file : paths.toList()) Files.deleteIfExists(file);
                        Files.deleteIfExists(folder);
                    } catch (IOException e) {
                        org.slf4j.LoggerFactory.getLogger(ChatAttachmentService.class).warn("Chat photo cleanup failed for session {}", session);
                    }
                }
            });
    }
}
