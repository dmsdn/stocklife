package com.storeflow.wishlist.controller;

import com.storeflow.global.security.CurrentConsumer;
import com.storeflow.wishlist.dto.WishlistItemResponse;
import com.storeflow.wishlist.service.WishlistService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** get_wishlist(13번). 조회 + 담기/빼기. */
@RestController
@RequestMapping("/api/wishlist")
public class WishlistController {

    private final WishlistService wishlistService;

    public WishlistController(WishlistService wishlistService) {
        this.wishlistService = wishlistService;
    }

    @GetMapping
    public ResponseEntity<List<WishlistItemResponse>> getWishlist(@CurrentConsumer Long consumerId) {
        return ResponseEntity.ok(wishlistService.getWishlist(consumerId));
    }

    @PostMapping("/{skuId}")
    public ResponseEntity<?> addItem(@CurrentConsumer Long consumerId, @PathVariable Integer skuId) {
        try {
            wishlistService.addItem(consumerId, skuId);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(404).body(e.getMessage());
        }
        return ResponseEntity.status(201).build();
    }

    @DeleteMapping("/{skuId}")
    public ResponseEntity<Void> removeItem(@CurrentConsumer Long consumerId, @PathVariable Integer skuId) {
        wishlistService.removeItem(consumerId, skuId);
        return ResponseEntity.noContent().build();
    }
}