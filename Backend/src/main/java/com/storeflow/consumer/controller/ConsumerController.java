package com.storeflow.consumer.controller;

import com.storeflow.consumer.dto.LoginRequest;
import com.storeflow.consumer.dto.LoginResponse;
import com.storeflow.consumer.dto.SignupRequest;
import com.storeflow.consumer.service.ConsumerService;
import com.storeflow.global.security.CurrentConsumer; // JWT에서 consumerId 꺼내는 커스텀 애노테이션 (아래 참고)
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/consumers")
public class ConsumerController {

    private final ConsumerService consumerService;

    public ConsumerController(ConsumerService consumerService) {
        this.consumerService = consumerService;
    }

    @PostMapping("/signup")
    public ResponseEntity<Void> signup(@Valid @RequestBody SignupRequest request) {
        consumerService.signup(request);
        return ResponseEntity.status(201).build();
    }

    // v2.5: persona_type 선택지 목록 API(/persona-types)는 폐기.
    // household_size(1~5)/has_pet/has_child/by_car는 고정된 선택지 목록이 필요 없어
    // 프론트가 하드코딩해도 되는 값이라 별도 조회 API를 두지 않는다.

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = consumerService.login(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CurrentConsumer Long consumerId) {
        consumerService.logout(consumerId);
        return ResponseEntity.noContent().build();
    }
}