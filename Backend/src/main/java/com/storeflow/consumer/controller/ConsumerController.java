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