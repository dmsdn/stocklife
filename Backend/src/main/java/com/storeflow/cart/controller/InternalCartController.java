package com.storeflow.cart.controller;

import com.storeflow.cart.dto.CartItemResponse;
import com.storeflow.cart.dto.InternalCartRequest;
import com.storeflow.cart.dto.AddCartItemRequest;
import com.storeflow.cart.dto.UpdateCartItemRequest;
import com.storeflow.cart.service.CartService;
import com.storeflow.global.internal.InternalServiceAuth;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Agent 서버(ai-server) 전용 내부 엔드포인트. 사용자 JWT가 없는 서버 대 서버 호출이라
 * consumerId를 직접 받고, X-Internal-Service-Key 헤더로 인증한다.
 * 로직 자체는 공개 /api/cart와 동일한 CartService를 그대로 재사용한다 — 규칙이 두 곳에서
 * 따로 놀지 않게 하기 위함이며, 소비자 도메인(장바구니) 고유 로직은 여전히 백엔드만 소유한다.
 *
 * 프론트는 절대 이 경로를 직접 호출하면 안 된다 (X-Internal-Service-Key가 노출되면 안 됨).
 * 게이트웨이/방화벽 레벨에서 외부 유입을 막는 것도 별도로 필요하다 (이 파일만으론 완전하지 않음).
 */
@RestController
@RequestMapping("/internal/cart")
public class InternalCartController {

    private final CartService cartService;
    private final InternalServiceAuth internalServiceAuth;

    public InternalCartController(CartService cartService, InternalServiceAuth internalServiceAuth) {
        this.cartService = cartService;
        this.internalServiceAuth = internalServiceAuth;
    }

    @PostMapping
    public ResponseEntity<?> addItem(@RequestHeader("X-Internal-Service-Key") String key,
                                     @Valid @RequestBody InternalCartRequest request) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        if (request.getSkuId() == null) {
            return ResponseEntity.badRequest().body("skuId는 필수입니다.");
        }

        AddCartItemRequest addRequest = new AddCartItemRequest();
        addRequest.setSkuId(request.getSkuId());
        addRequest.setQuantity(request.getQuantity() != null ? request.getQuantity() : 1);

        cartService.addItem(request.getConsumerId(), addRequest);
        return ResponseEntity.status(201).build();
    }

    @GetMapping
    public ResponseEntity<?> getCart(@RequestHeader("X-Internal-Service-Key") String key,
                                     @RequestParam Long consumerId) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        List<CartItemResponse> cart = cartService.getCart(consumerId);
        return ResponseEntity.ok(cart);
    }

    @PatchMapping("/{cartItemId}")
    public ResponseEntity<?> updateItem(@RequestHeader("X-Internal-Service-Key") String key,
                                        @PathVariable Long cartItemId,
                                        @RequestBody InternalCartRequest request) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        UpdateCartItemRequest updateRequest = new UpdateCartItemRequest();
        updateRequest.setQuantity(request.getQuantity());
        updateRequest.setChecked(request.getChecked());

        try {
            cartService.updateItem(request.getConsumerId(), cartItemId, updateRequest);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(404).body(e.getMessage());
        }
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{cartItemId}")
    public ResponseEntity<?> deleteItem(@RequestHeader("X-Internal-Service-Key") String key,
                                        @PathVariable Long cartItemId,
                                        @RequestParam Long consumerId) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        try {
            cartService.deleteItem(consumerId, cartItemId);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(404).body(e.getMessage());
        }
        return ResponseEntity.noContent().build();
    }

        @GetMapping("/session")
    public ResponseEntity<?> getSessionCart(@RequestHeader("X-Internal-Service-Key") String key,
                                            @RequestParam Long consumerId) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        return ResponseEntity.ok(cartService.getSessionCart(consumerId));
    }
}