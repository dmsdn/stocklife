package com.storeflow.chat.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.ObjectCannedACL;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.util.UUID;

/** NCP Object Storage 업로드/삭제만 담당. 어떤 종류의 첨부인지, DB에 뭘 남길지는 모른다. */
@Service
public class ObjectStorageService {

    private final S3Client s3Client;

    @Value("${ncp.object-storage.bucket}")
    private String bucket;

    @Value("${ncp.object-storage.endpoint}")
    private String endpoint;

    public ObjectStorageService(S3Client s3Client) {
        this.s3Client = s3Client;
    }

    /**
     * 업로드하고 (storageKey, publicUrl)을 돌려준다.
     * key는 chat-attachments/yyyy-MM-dd/UUID_원본파일명 형태로 만들어 충돌을 피하고
     * 날짜별로 훑어보기 쉽게 한다.
     */
    public UploadResult upload(InputStream inputStream, long contentLength, String contentType,
                               String originalFilename) {
        String safeName = sanitizeFilename(originalFilename);
        String key = "chat-attachments/%s/%s_%s".formatted(
                LocalDate.now(), UUID.randomUUID(), safeName);

        try {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(key)
                            .contentType(contentType)
                            .acl(ObjectCannedACL.PUBLIC_READ) // 챗 이미지 미리보기를 바로 <img src>로 띄우기 위함
                            .build(),
                    RequestBody.fromInputStream(inputStream, contentLength)
            );
        } catch (Exception e) {
            throw new IllegalStateException("파일 업로드에 실패했습니다: " + e.getMessage(), e);
        }

        // forcePathStyle=true로 클라이언트를 만들었으므로 URL도 path-style로 맞춘다.
        String url = "%s/%s/%s".formatted(stripTrailingSlash(endpoint), bucket, key);
        return new UploadResult(key, url);
    }

    public void delete(String storageKey) {
        s3Client.deleteObject(
                DeleteObjectRequest.builder()
                        .bucket(bucket)
                        .key(storageKey)
                        .build()
        );
    }

    private String stripTrailingSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }

    /** object key에 위험한 문자(경로 이동, 공백 등)가 안 들어가게 최소한만 치환. */
    private String sanitizeFilename(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) {
            return "file";
        }
        return originalFilename.replaceAll("[^a-zA-Z0-9._\\-가-힣]", "_");
    }

    public record UploadResult(String storageKey, String url) {}
}