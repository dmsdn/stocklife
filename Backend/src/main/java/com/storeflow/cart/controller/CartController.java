package com.storeflow.cart.controller;

import com.storeflow.cart.dto.AddCartItemRequest;
import com.storeflow.cart.dto.CartItemResponse;
import com.storeflow.cart.dto.UpdateCartItemRequest;
import com.storeflow.cart.service.CartService;
import com.storeflow.global.security.CurrentConsumer;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/cart")
public class CartController {

    private final CartService cartService;

    public CartController(CartService cartService) {
        this.cartService = cartService;
    }

    @PostMapping
    public ResponseEntity<Void> addItem(@CurrentConsumer Long consumerId,
                                         @Valid @RequestBody AddCartItemRequest request) {
        cartService.addItem(consumerId, request);
        return ResponseEntity.status(201).build();
    }

    @GetMapping
    public ResponseEntity<List<CartItemResponse>> getCart(@CurrentConsumer Long consumerId) {
        return ResponseEntity.ok(cartService.getCart(consumerId));
    }

    @PatchMapping("/{cartItemId}")
    public ResponseEntity<Void> updateItem(@CurrentConsumer Long consumerId,
                                            @PathVariable Long cartItemId,
                                            @Valid @RequestBody UpdateCartItemRequest request) {
        cartService.updateItem(consumerId, cartItemId, request);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{cartItemId}")
    public ResponseEntity<Void> deleteItem(@CurrentConsumer Long consumerId,
                                            @PathVariable Long cartItemId) {
        cartService.deleteItem(consumerId, cartItemId);
        return ResponseEntity.noContent().build();
    }
}