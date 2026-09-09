package com.storeflow.cart.controller;

import com.storeflow.cart.dto.*;
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
    private final ConsumerJwtUtil jwtUtil;

    public CartController(CartService cartService, ConsumerJwtUtil jwtUtil) {
        this.cartService = cartService;
        this.jwtUtil = jwtUtil;
    }

    /**
     * 09-08: 장바구니 동선 기능은 이미 com.storeflow.navigation 패키지에
     * (NavigationController: POST /api/navigation/cart-route) DB map_cells 기반
     * 실제 A* + 층간 이동 + Held-Karp TSP로 구현되어 있었다. 여기에 같은 이름
     * (CartRouteService)으로 별도 구현을 또 추가했다가 스프링 빈 이름 충돌로
     * bootRun이 죽는 사고가 있었음 — 제거하고 기존 것을 그대로 쓴다.
     * 프론트는 api/route.ts에서 POST /api/navigation/cart-route를 호출한다.
     */

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