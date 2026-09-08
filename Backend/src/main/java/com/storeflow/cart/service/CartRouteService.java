package com.storeflow.cart.controller;

import com.storeflow.cart.dto.*;
import com.storeflow.cart.service.CartRouteService;
import com.storeflow.cart.service.CartService;
import com.storeflow.global.jwt.ConsumerJwtUtil;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 회원 장바구니 DB API. 비회원 장바구니는 프론트 localStorage만 사용한다. */
@RestController
@RequestMapping("/api/cart")
public class CartController {
    private final CartService cartService;
    private final CartRouteService cartRouteService;
    private final ConsumerJwtUtil jwtUtil;

    public CartController(CartService cartService, CartRouteService cartRouteService, ConsumerJwtUtil jwtUtil) {
        this.cartService = cartService;
        this.cartRouteService = cartRouteService;
        this.jwtUtil = jwtUtil;
    }

    /**
     * 장바구니(체크된 항목)에 담긴 상품들을 가장 효율적인 순서로 담기 위한 동선.
     * startX/startY/startFloor는 시뮬레이션 화면 속 캐릭터의 현재 위치 — 생략하면 1층 (0,0)에서
     * 출발한다고 가정한다. 프론트는 이 응답의 stops를 순서대로 이어 A*로 선을 그린다.
     */
    @GetMapping("/groups/{groupId}/route")
    public ResponseEntity<CartRouteResponse> getGroupRoute(
            @RequestHeader("Authorization") String authorization,
            @PathVariable Long groupId,
            @RequestParam(defaultValue = "1") int startFloor,
            @RequestParam(defaultValue = "0") int startX,
            @RequestParam(defaultValue = "0") int startY
    ) {
        return ResponseEntity.ok(cartRouteService.getRoute(
                requireConsumerId(authorization), groupId, startFloor, startX, startY));
    }

    @GetMapping
    public ResponseEntity<List<CartItemResponse>> getCart(@RequestHeader("Authorization") String authorization) {
        return ResponseEntity.ok(cartService.getCart(requireConsumerId(authorization)));
    }

    @PostMapping
    public ResponseEntity<Void> addItem(@RequestHeader("Authorization") String authorization,
                                        @Valid @RequestBody AddCartItemRequest request) {
        cartService.addItem(requireConsumerId(authorization), request);
        return ResponseEntity.status(201).build();
    }

    @GetMapping("/groups")
    public ResponseEntity<List<CartGroupResponse>> getGroups(@RequestHeader("Authorization") String authorization) {
        return ResponseEntity.ok(cartService.getGroups(requireConsumerId(authorization)));
    }

    @PostMapping("/groups")
    public ResponseEntity<CartGroupResponse> createGroup(@RequestHeader("Authorization") String authorization,
                                                         @Valid @RequestBody CreateCartGroupRequest request) {
        return ResponseEntity.status(201).body(cartService.createGroup(requireConsumerId(authorization), request));
    }

    @GetMapping("/groups/{groupId}")
    public ResponseEntity<CartGroupResponse> getGroup(@RequestHeader("Authorization") String authorization,
                                                      @PathVariable Long groupId) {
        return ResponseEntity.ok(cartService.getGroup(requireConsumerId(authorization), groupId));
    }

    @PatchMapping("/groups/{groupId}")
    public ResponseEntity<CartGroupResponse> updateGroup(@RequestHeader("Authorization") String authorization,
                                                         @PathVariable Long groupId,
                                                         @RequestBody UpdateCartGroupRequest request) {
        return ResponseEntity.ok(cartService.updateGroup(requireConsumerId(authorization), groupId, request));
    }

    @DeleteMapping("/groups/{groupId}")
    public ResponseEntity<Void> deleteGroup(@RequestHeader("Authorization") String authorization,
                                            @PathVariable Long groupId) {
        cartService.deleteGroup(requireConsumerId(authorization), groupId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/groups/{groupId}/items")
    public ResponseEntity<CartItemResponse> addItemToGroup(@RequestHeader("Authorization") String authorization,
                                                           @PathVariable Long groupId,
                                                           @Valid @RequestBody AddCartItemRequest request) {
        return ResponseEntity.status(201).body(
                cartService.addItemToGroup(requireConsumerId(authorization), groupId, request));
    }

    @PatchMapping("/{cartItemId}")
    public ResponseEntity<Void> updateItem(@RequestHeader("Authorization") String authorization,
                                           @PathVariable Long cartItemId,
                                           @Valid @RequestBody UpdateCartItemRequest request) {
        cartService.updateItem(requireConsumerId(authorization), cartItemId, request);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{cartItemId}")
    public ResponseEntity<Void> deleteItem(@RequestHeader("Authorization") String authorization,
                                           @PathVariable Long cartItemId) {
        cartService.deleteItem(requireConsumerId(authorization), cartItemId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/migrate")
    public ResponseEntity<List<CartGroupResponse>> migrate(@RequestHeader("Authorization") String authorization,
                                                           @RequestBody MigrateGuestCartRequest request) {
        return ResponseEntity.ok(cartService.migrateGuestCart(requireConsumerId(authorization), request));
    }

    @GetMapping("/session")
    public ResponseEntity<SessionCartResponse> getSessionCart(@RequestHeader("Authorization") String authorization) {
        return ResponseEntity.ok(cartService.getSessionCart(requireConsumerId(authorization)));
    }

    private Long requireConsumerId(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new IllegalStateException("로그인이 필요합니다.");
        }
        String token = authorization.substring(7);
        if (!jwtUtil.validateToken(token)) throw new IllegalStateException("유효하지 않은 로그인입니다.");
        return jwtUtil.getConsumerIdFromToken(token);
    }
}