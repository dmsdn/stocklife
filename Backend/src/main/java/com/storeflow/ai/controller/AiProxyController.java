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
    private final com.storeflow.global.jwt.ConsumerJwtUtil jwtUtil;
    @Value("${internal.service-key}")
    private String internalKey;

    @Value("${agent.base-url}")
    private String agentBaseUrl;

    public AiProxyController(RestTemplate restTemplate, com.storeflow.global.jwt.ConsumerJwtUtil jwtUtil) {
        this.restTemplate = restTemplate;
        this.jwtUtil = jwtUtil;
    }

    @PostMapping("/search")
    public ResponseEntity<Object> search(@RequestBody Map<String, String> body) {
        Object response = restTemplate.postForObject(
                agentBaseUrl + "/api/ai/search", body, Object.class);
        return ResponseEntity.ok(response);
    }

    /** 상품 구매 순서는 Agent의 기존 최적화 솔버가 정한다. 이 프록시는 DB를 쓰지 않는다. */
    @PostMapping("/route-optimize")
    public ResponseEntity<Object> optimizeRoute(@RequestBody Map<String, Object> body) {
        Object response = restTemplate.postForObject(
                agentBaseUrl + "/api/ai/route-optimize", body, Object.class);
        return ResponseEntity.ok(response);
    }

    /** 신원은 JWT에서만 읽는다. 클라이언트가 body에 넣은 consumerId는 폐기한다. */
    @PostMapping("/list-insights")
    public ResponseEntity<Object> listInsights(@RequestBody Map<String, Object> body,
                                               @RequestHeader(value = "Authorization", required = false) String authorization) {
        Long consumerId = null;
        if (authorization != null) {
            if (!authorization.startsWith("Bearer ") || !jwtUtil.validateToken(authorization.substring(7)))
                return ResponseEntity.status(401).build();
            consumerId = jwtUtil.getConsumerIdFromToken(authorization.substring(7));
        }
        Map<String, Object> safe = new java.util.HashMap<>();
        safe.put("skuIds", body.get("skuIds"));
        safe.put("consumerId", consumerId);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Internal-Service-Key", internalKey);
        return ResponseEntity.ok(restTemplate.postForObject(agentBaseUrl + "/api/ai/list-insights",
                new HttpEntity<>(safe, headers), Object.class));
    }

    /**
     * 홈 화면 "OO님을 위한 추천" 카드. 신원은 JWT에서만 읽고, limit은 쿼리 파라미터로 받는다.
     * frontend/lib/home-data.ts의 fetchLivRecommendations()가 로그인 상태에서만 호출한다.
     */
    @GetMapping("/recommendations")
    public ResponseEntity<Object> getRecommendations(
            @RequestParam(value = "limit", defaultValue = "8") Integer limit,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")
                || !jwtUtil.validateToken(authorization.substring(7))) {
            return ResponseEntity.status(401).build();
        }
        Long consumerId = jwtUtil.getConsumerIdFromToken(authorization.substring(7));

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("consumerId", consumerId);
        body.put("limit", limit);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Internal-Service-Key", internalKey);

        return ResponseEntity.ok(restTemplate.postForObject(agentBaseUrl + "/api/ai/recommendations",
                new HttpEntity<>(body, headers), Object.class));
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