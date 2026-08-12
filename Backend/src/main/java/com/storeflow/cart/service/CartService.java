package com.storeflow.cart.service;

import com.storeflow.cart.dto.AddCartItemRequest;
import com.storeflow.cart.dto.CartItemResponse;
import com.storeflow.cart.dto.UpdateCartItemRequest;
import com.storeflow.cart.entity.CartItem;
import com.storeflow.cart.repository.CartItemRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class CartService {

    private final CartItemRepository cartItemRepository;

    public CartService(CartItemRepository cartItemRepository) {
        this.cartItemRepository = cartItemRepository;
    }

    @Transactional
    public void addItem(Long consumerId, AddCartItemRequest request) {
        cartItemRepository.findByConsumerIdAndSkuId(consumerId, request.getSkuId())
                .ifPresentOrElse(
                        existing -> existing.increaseQuantity(request.getQuantity()), // 이미 있으면 수량만 증가
                        () -> cartItemRepository.save(
                                new CartItem(consumerId, request.getSkuId(), request.getQuantity())
                        )
                );
    }

    @Transactional(readOnly = true)
    public List<CartItemResponse> getCart(Long consumerId) {
        return cartItemRepository.findByConsumerId(consumerId).stream()
                .map(CartItemResponse::new)
                .collect(Collectors.toList());
    }

    @Transactional
    public void updateItem(Long consumerId, Long cartItemId, UpdateCartItemRequest request) {
        CartItem cartItem = cartItemRepository.findByCartItemIdAndConsumerId(cartItemId, consumerId)
                .orElseThrow(() -> new IllegalStateException("장바구니 항목을 찾을 수 없습니다."));

        if (request.getQuantity() != null) {
            cartItem.changeQuantity(request.getQuantity());
        }
        if (request.getChecked() != null) {
            cartItem.toggleChecked(request.getChecked());
        }
    }

    @Transactional
    public void deleteItem(Long consumerId, Long cartItemId) {
        CartItem cartItem = cartItemRepository.findByCartItemIdAndConsumerId(cartItemId, consumerId)
                .orElseThrow(() -> new IllegalStateException("장바구니 항목을 찾을 수 없습니다."));

        cartItemRepository.delete(cartItem);
    }
}