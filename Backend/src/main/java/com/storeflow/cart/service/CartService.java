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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class CartService {

    private static final Logger log = LoggerFactory.getLogger(CartService.class);

    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;

    public CartService(CartItemRepository cartItemRepository, ProductRepository productRepository) {
        this.cartItemRepository = cartItemRepository;
        this.productRepository = productRepository;
    }

    // ------------------------------------------------------------------
    // 회원(consumerId) 장바구니 — 기존 로직 그대로
    // ------------------------------------------------------------------

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

    /** get_session_cart(12번). 회원 전용. */
    @Transactional(readOnly = true)
    public SessionCartResponse getSessionCart(Long consumerId) {
        return buildSessionCart(cartItemRepository.findByConsumerId(consumerId));
    }

    @Transactional
    public void updateItem(Long consumerId, Long cartItemId, UpdateCartItemRequest request) {
        CartItem cartItem = cartItemRepository.findByCartItemIdAndConsumerId(cartItemId, consumerId)
                .orElseThrow(() -> new IllegalStateException("장바구니 항목을 찾을 수 없습니다."));

        applyUpdate(cartItem, request);
    }

    @Transactional
    public void deleteItem(Long consumerId, Long cartItemId) {
        CartItem cartItem = cartItemRepository.findByCartItemIdAndConsumerId(cartItemId, consumerId)
                .orElseThrow(() -> new IllegalStateException("장바구니 항목을 찾을 수 없습니다."));

        cartItemRepository.delete(cartItem);
    }

    // ------------------------------------------------------------------
    // 비회원(sessionId) 장바구니 — 요구사항 30 "비회원은 세션 기준"
    // ------------------------------------------------------------------

    @Transactional
    public void addItemForGuest(String sessionId, AddCartItemRequest request) {
        cartItemRepository.findBySessionIdAndSkuId(sessionId, request.getSkuId())
                .ifPresentOrElse(
                        existing -> existing.increaseQuantity(request.getQuantity()),
                        () -> cartItemRepository.save(
                                CartItem.forGuest(sessionId, request.getSkuId(), request.getQuantity())
                        )
                );
    }

    @Transactional(readOnly = true)
    public List<CartItemResponse> getCartForGuest(String sessionId) {
        return cartItemRepository.findBySessionId(sessionId).stream()
                .map(CartItemResponse::new)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public SessionCartResponse getSessionCartForGuest(String sessionId) {
        return buildSessionCart(cartItemRepository.findBySessionId(sessionId));
    }

    @Transactional
    public void updateItemForGuest(String sessionId, Long cartItemId, UpdateCartItemRequest request) {
        CartItem cartItem = cartItemRepository.findByCartItemIdAndSessionId(cartItemId, sessionId)
                .orElseThrow(() -> new IllegalStateException("장바구니 항목을 찾을 수 없습니다."));

        applyUpdate(cartItem, request);
    }

    @Transactional
    public void deleteItemForGuest(String sessionId, Long cartItemId) {
        CartItem cartItem = cartItemRepository.findByCartItemIdAndSessionId(cartItemId, sessionId)
                .orElseThrow(() -> new IllegalStateException("장바구니 항목을 찾을 수 없습니다."));

        cartItemRepository.delete(cartItem);
    }

    // ------------------------------------------------------------------
    // 비회원 → 회원 승계 (요구사항 29)
    // ConsumerService.login()이 행동 이벤트 승계(claimGuestEvents)와 같은
    // 트랜잭션 안에서 이 메서드를 호출한다 — "한 트랜잭션으로 처리" 요건.
    // ------------------------------------------------------------------

    @Transactional
    public int claimGuestCart(String sessionId, Long consumerId) {
        if (sessionId == null || sessionId.isBlank()) {
            return 0;
        }

        List<CartItem> guestItems = cartItemRepository.findBySessionId(sessionId);
        int claimed = 0;

        for (CartItem guestItem : guestItems) {
            var existing = cartItemRepository.findByConsumerIdAndSkuId(consumerId, guestItem.getSkuId());
            if (existing.isPresent()) {
                // 동일 SKU가 이미 회원 카트에 있으면 수량을 병합하고 비회원 항목은 제거
                existing.get().increaseQuantity(guestItem.getQuantity());
                cartItemRepository.delete(guestItem);
            } else {
                // 없으면 그대로 소유권만 이전
                guestItem.claimBy(consumerId);
            }
            claimed++;
        }

        if (claimed > 0) {
            log.info("비회원 장바구니 {}건을 sessionId={} → consumerId={} 로 승계했습니다.",
                    claimed, sessionId, consumerId);
        }
        return claimed;
    }

    // ------------------------------------------------------------------
    // 내부 공통
    // ------------------------------------------------------------------

    private void applyUpdate(CartItem cartItem, UpdateCartItemRequest request) {
        if (request.getQuantity() != null) {
            cartItem.changeQuantity(request.getQuantity());
        }
        if (request.getChecked() != null) {
            cartItem.toggleChecked(request.getChecked());
        }
    }

    private SessionCartResponse buildSessionCart(List<CartItem> items) {
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
}