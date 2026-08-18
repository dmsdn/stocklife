package com.storeflow.order.service;

import com.storeflow.cart.entity.CartItem;
import com.storeflow.cart.repository.CartItemRepository;
import com.storeflow.consumer.entity.Consumer;
import com.storeflow.consumer.repository.ConsumerRepository;
import com.storeflow.order.dto.FrequentPurchaseResponse;
import com.storeflow.order.dto.OrderResponse;
import com.storeflow.order.entity.Order;
import com.storeflow.order.entity.OrderItem;
import com.storeflow.order.repository.OrderRepository;
import com.storeflow.product.entity.Product;
import com.storeflow.product.repository.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class OrderService {

    // "몇 번 이상 사야 '항상 구매하는' 상품으로 볼 것인가"의 기본값.
    // 1로 두면 딱 한 번 산 것도 걸리므로 최소 2번은 반복되어야 "항상"으로 인정한다.
    private static final long DEFAULT_MIN_PURCHASE_COUNT = 2;

    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;
    private final OrderRepository orderRepository;
    private final ConsumerRepository consumerRepository;

    public OrderService(CartItemRepository cartItemRepository,
                        ProductRepository productRepository,
                        OrderRepository orderRepository,
                        ConsumerRepository consumerRepository) {
        this.cartItemRepository = cartItemRepository;
        this.productRepository = productRepository;
        this.orderRepository = orderRepository;
        this.consumerRepository = consumerRepository;
    }

    @Transactional
    public OrderResponse checkout(Long consumerId) {
        // 1. 체크된 장바구니 항목만 조회
        List<CartItem> checkedItems = cartItemRepository.findByConsumerId(consumerId).stream()
                .filter(CartItem::isChecked)
                .toList();

        if (checkedItems.isEmpty()) {
            throw new IllegalStateException("결제할 상품이 선택되지 않았습니다.");
        }

        // 2. 주문 생성 (가상 결제 - 버튼 누르는 즉시 PAID 처리)
        Order order = new Order(consumerId);

        for (CartItem cartItem : checkedItems) {
            // 3. 재고 확인 + 차감 (동시성 안전한 락 조회)
            Product product = productRepository.findWithLockBySkuId(cartItem.getSkuId())
                    .orElseThrow(() -> new IllegalStateException("존재하지 않는 상품입니다. skuId=" + cartItem.getSkuId()));

            product.decreaseStock(cartItem.getQuantity());

            // 4. 주문 당시 가격/이름을 스냅샷으로 저장
            order.addItem(new OrderItem(
                    product.getSkuId(),
                    product.getName(),
                    product.getPriceKrw(),
                    cartItem.getQuantity()
            ));
        }

        orderRepository.save(order);

        // 5. 등급 산정용 누적 결제금액 반영
        Consumer consumer = consumerRepository.findById(consumerId)
                .orElseThrow(() -> new IllegalStateException("존재하지 않는 회원입니다."));
        consumer.addSpend(order.getTotalAmount());

        // 6. 결제된 장바구니 항목만 삭제 (체크 안 된 건 그대로 유지)
        cartItemRepository.deleteAll(checkedItems);

        return new OrderResponse(order);
    }

    @Transactional(readOnly = true)
    public List<OrderResponse> getMyOrders(Long consumerId) {
        return orderRepository.findByConsumerIdOrderByCreatedAtDesc(consumerId).stream()
                .map(OrderResponse::new)
                .toList();
    }

    @Transactional(readOnly = true)
    public OrderResponse getOrderDetail(Long consumerId, Long orderId) {
        Order order = orderRepository.findByOrderIdAndConsumerId(orderId, consumerId)
                .orElseThrow(() -> new IllegalStateException("주문을 찾을 수 없습니다."));
        return new OrderResponse(order);
    }

    /**
     * "내가 항상 구매하는 X 장바구니에 담아줘" 요청을 처리하기 위한 조회.
     * keyword가 null/blank면 전체 반복 구매 상품을, 있으면 그 키워드가 이름에 포함된
     * 상품만 필터링해서 반환한다. minCount 미만이면 반복 구매로 안 보고, minCount는
     * null이면 기본값(2)을 쓴다.
     */
    @Transactional(readOnly = true)
    public List<FrequentPurchaseResponse> getFrequentPurchases(Long consumerId, String keyword, Long minCount) {
        String normalizedKeyword = (keyword == null || keyword.isBlank()) ? null : keyword.trim();
        long threshold = (minCount == null || minCount < 1) ? DEFAULT_MIN_PURCHASE_COUNT : minCount;

        return orderRepository.findFrequentPurchases(consumerId, normalizedKeyword, threshold).stream()
                .map(FrequentPurchaseResponse::new)
                .toList();
    }
}