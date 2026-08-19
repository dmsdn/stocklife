package com.storeflow.cart.controller;

import com.storeflow.cart.dto.AddCartItemRequest;
import com.storeflow.cart.dto.CartItemResponse;
import com.storeflow.cart.dto.SessionCartResponse;
import com.storeflow.cart.dto.UpdateCartItemRequest;
import com.storeflow.cart.service.CartService;
import com.storeflow.global.jwt.ConsumerJwtUtil;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 요구사항 30: 장바구니는 "비회원은 세션 기준, 회원은 계정 기준"으로 담긴다.
 *
 * Authorization: Bearer 헤더가 유효하면 회원(consumerId) 로직을,
 * 없거나 유효하지 않으면 X-Session-Id 헤더를 요구해 비회원(sessionId) 로직을 탄다.
 * ConsumerEventController.resolveMemberIdOrNull()과 동일한 패턴.
 */
@RestController
@RequestMapping("/api/cart")
public class CartController {

    private final CartService cartService;
    private final ConsumerJwtUtil jwtUtil;

    public CartController(CartService cartService, ConsumerJwtUtil jwtUtil) {
        this.cartService = cartService;
        this.jwtUtil = jwtUtil;
    }

    @PostMapping
    public ResponseEntity<Void> addItem(@RequestHeader(value = "Authorization", required = false) String authorization,
                                        @RequestHeader(value = "X-Session-Id", required = false) String sessionId,
                                        @Valid @RequestBody AddCartItemRequest request) {
        Long consumerId = resolveConsumerIdOrNull(authorization);
        if (consumerId != null) {
            cartService.addItem(consumerId, request);
        } else {
            cartService.addItemForGuest(requireSessionId(sessionId), request);
        }
        return ResponseEntity.status(201).build();
    }

    @GetMapping
    public ResponseEntity<List<CartItemResponse>> getCart(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                          @RequestHeader(value = "X-Session-Id", required = false) String sessionId) {
        Long consumerId = resolveConsumerIdOrNull(authorization);
        if (consumerId != null) {
            return ResponseEntity.ok(cartService.getCart(consumerId));
        }
        return ResponseEntity.ok(cartService.getCartForGuest(requireSessionId(sessionId)));
    }

    /** get_session_cart(요구사항 12번) — 회원/비회원 공용. 합계는 백엔드가 계산해서 반환. */
    @GetMapping("/session")
    public ResponseEntity<SessionCartResponse> getSessionCart(@RequestHeader(value = "Authorization", required = false) String authorization,
                                                              @RequestHeader(value = "X-Session-Id", required = false) String sessionId) {
        Long consumerId = resolveConsumerIdOrNull(authorization);
        if (consumerId != null) {
            return ResponseEntity.ok(cartService.getSessionCart(consumerId));
        }
        return ResponseEntity.ok(cartService.getSessionCartForGuest(requireSessionId(sessionId)));
    }

    @PatchMapping("/{cartItemId}")
    public ResponseEntity<Void> updateItem(@RequestHeader(value = "Authorization", required = false) String authorization,
                                           @RequestHeader(value = "X-Session-Id", required = false) String sessionId,
                                           @PathVariable Long cartItemId,
                                           @Valid @RequestBody UpdateCartItemRequest request) {
        Long consumerId = resolveConsumerIdOrNull(authorization);
        if (consumerId != null) {
            cartService.updateItem(consumerId, cartItemId, request);
        } else {
            cartService.updateItemForGuest(requireSessionId(sessionId), cartItemId, request);
        }
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{cartItemId}")
    public ResponseEntity<Void> deleteItem(@RequestHeader(value = "Authorization", required = false) String authorization,
                                           @RequestHeader(value = "X-Session-Id", required = false) String sessionId,
                                           @PathVariable Long cartItemId) {
        Long consumerId = resolveConsumerIdOrNull(authorization);
        if (consumerId != null) {
            cartService.deleteItem(consumerId, cartItemId);
        } else {
            cartService.deleteItemForGuest(requireSessionId(sessionId), cartItemId);
        }
        return ResponseEntity.noContent().build();
    }

    // ------------------------------------------------------------------

    private Long resolveConsumerIdOrNull(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            return null;
        }
        String token = authorization.substring(7);
        if (!jwtUtil.validateToken(token)) {
            return null;
        }
        return jwtUtil.getConsumerIdFromToken(token);
    }

    private String requireSessionId(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            throw new IllegalStateException("비회원 장바구니는 X-Session-Id 헤더가 필수입니다.");
        }
        return sessionId;
    }
}