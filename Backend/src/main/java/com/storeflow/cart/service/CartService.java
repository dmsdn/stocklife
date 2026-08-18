package com.storeflow.cart.service;

import com.storeflow.cart.dto.AddCartItemRequest;
import com.storeflow.cart.dto.CartItemResponse;
import com.storeflow.cart.dto.SessionCartItemResponse;
import com.storeflow.cart.dto.SessionCartResponse;
import com.storeflow.cart.dto.UpdateCartItemRequest;
import com.storeflow.cart.entity.CartItem;
import com.storeflow.cart.repository.CartItemRepository;
import com.storeflow.product.entity.Product;
import com.storeflow.product.repository.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class CartService {

    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;

    public CartService(CartItemRepository cartItemRepository, ProductRepository productRepository) {
        this.cartItemRepository = cartItemRepository;
        this.productRepository = productRepository;
    }

    @Transactional
    public void addItem(Long consumerId, AddCartItemRequest request) {
        cartItemRepository.findByConsumerIdAndSkuId(consumerId, request.getSkuId())
                .ifPresentOrElse(
                        existing -> existing.increaseQuantity(request.getQuantity()),
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

    /** get_session_cart(12번). 회원 전용 — 비회원 세션 카트는 아직 지원 안 함(위 설명 참고). */
    @Transactional(readOnly = true)
    public SessionCartResponse getSessionCart(Long consumerId) {
        List<CartItem> items = cartItemRepository.findByConsumerId(consumerId);
        List<SessionCartItemResponse> itemResponses = new ArrayList<>();
        int total = 0;

        for (CartItem item : items) {
            Product product = productRepository.findById(item.getSkuId())
                    .orElseThrow(() -> new IllegalStateException(
                            "존재하지 않는 상품입니다. skuId=" + item.getSkuId()));
            int subtotal = product.getPriceKrw() * item.getQuantity();
            itemResponses.add(new SessionCartItemResponse(item, product, subtotal));
            total += subtotal;
        }

        return new SessionCartResponse(itemResponses, total);
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