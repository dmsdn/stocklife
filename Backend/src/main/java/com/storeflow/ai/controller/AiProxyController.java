package com.storeflow.ai.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@RestController
@RequestMapping("/api/ai")
public class AiProxyController {

    private final RestTemplate restTemplate;
    private static final String FASTAPI_BASE_URL = "http://localhost:8000"; // 나중에 설정파일로 분리

    public AiProxyController(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    @PostMapping("/search")
    public ResponseEntity<Object> search(@RequestBody Map<String, String> body) {
        Object response = restTemplate.postForObject(
                FASTAPI_BASE_URL + "/api/ai/search", body, Object.class);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/products/{skuId}/alternatives")
    public ResponseEntity<Object> getAlternatives(@PathVariable Integer skuId) {
        Object response = restTemplate.getForObject(
                FASTAPI_BASE_URL + "/api/products/" + skuId + "/alternatives", Object.class);
        return ResponseEntity.ok(response);
    }
}
