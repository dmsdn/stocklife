package com.storeflow.wishlist.controller;

import com.storeflow.global.internal.InternalServiceAuth;
import com.storeflow.wishlist.dto.WishlistItemResponse;
import com.storeflow.wishlist.service.WishlistService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Agent 서버 전용 서버 대 서버 위시리스트 조회 창구. 공개 /api/wishlist가 대체하지 못하는
 * 이유 — @CurrentConsumer가 사용자 JWT를 요구하는데 에이전트는 브라우저가 아니라 서버라
 * 토큰이 없다(IllegalStateException: 인증 토큰이 없습니다 → 500).
 *
 * get_wishlist("찜한 것 중에 행사하는 거 있어요?") · 진입 브리핑에 사용된다.
 * 프론트는 절대 이 경로를 직접 호출하면 안 된다.
 */
@RestController
@RequestMapping("/internal/wishlist")
public class InternalWishlistController {

    private final WishlistService wishlistService;
    private final InternalServiceAuth internalServiceAuth;

    public InternalWishlistController(WishlistService wishlistService, InternalServiceAuth internalServiceAuth) {
        this.wishlistService = wishlistService;
        this.internalServiceAuth = internalServiceAuth;
    }

    /** wishlist는 세계 시드 테이블이라 memberId를 그대로 받는다(consumerId 아님). */
    @GetMapping
    public ResponseEntity<?> getWishlist(
            @RequestHeader("X-Internal-Service-Key") String key,
            @RequestParam Integer memberId) {
        try {
            internalServiceAuth.verify(key);
        } catch (SecurityException e) {
            return ResponseEntity.status(401).body(e.getMessage());
        }

        List<WishlistItemResponse> result = wishlistService.getWishlistByMemberId(memberId);
        return ResponseEntity.ok(result);
    }
}