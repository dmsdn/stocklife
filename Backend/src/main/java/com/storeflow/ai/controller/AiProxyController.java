package com.storeflow.ai.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
public class AiProxyController {

    private final RestTemplate restTemplate;

    @Value("${agent.base-url}")
    private String agentBaseUrl;

    public AiProxyController(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @PostMapping("/search")
    public ResponseEntity<Object> search(@RequestBody Map<String, String> body) {
        Object response = restTemplate.postForObject(
                agentBaseUrl + "/api/ai/search", body, Object.class);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/products/{skuId}/alternatives")
    public ResponseEntity<Object> getAlternatives(@PathVariable Integer skuId) {
        Object response = restTemplate.getForObject(
                agentBaseUrl + "/api/products/" + skuId + "/alternatives", Object.class);
        return ResponseEntity.ok(response);
    }

    /**
     * relay_photo_search(15번). 소비자가 찍은 사진을 열어보지 않고 그대로 Agent로 릴레이한다.
     * 프론트가 Agent 서버와 직접 통신하지 않게, 인증/세션은 백엔드가 계속 들고 있는 구조.
     */
    @PostMapping(value = "/photo-search", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> photoSearch(@RequestParam("photo") MultipartFile photo) {
        if (photo.isEmpty()) {
            return ResponseEntity.badRequest().body("사진 파일이 비어 있습니다.");
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
            body.add("photo", new ByteArrayResource(photo.getBytes()) {
                @Override
                public String getFilename() {
                    return photo.getOriginalFilename();
                }
            });

            HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);

            ResponseEntity<Object> response = restTemplate.postForEntity(
                    agentBaseUrl + "/api/ai/photo-search", requestEntity, Object.class);

            return ResponseEntity.ok(response.getBody());
        } catch (IOException e) {
            return ResponseEntity.status(500).body("사진 파일을 읽는 중 오류가 발생했습니다.");
        }
    }
}