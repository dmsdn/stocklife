package com.storeflow.order.service;

import com.storeflow.cart.entity.CartItem;
import com.storeflow.cart.repository.CartItemRepository;
import com.storeflow.consumer.entity.Consumer;
import com.storeflow.consumer.entity.Member;
import com.storeflow.consumer.repository.ConsumerRepository;
import com.storeflow.inventory.entity.ConsumerEvent;
import com.storeflow.inventory.service.ConsumerEventService;
import com.storeflow.inventory.service.InventoryService;
import com.storeflow.order.dto.OrderResponse;
import com.storeflow.order.entity.Order;
import com.storeflow.order.entity.OrderItem;
import com.storeflow.order.repository.OrderRepository;
import com.storeflow.product.entity.Product;
import com.storeflow.product.repository.ProductRepository;
import com.storeflow.purchase.entity.Purchase;
import com.storeflow.purchase.repository.PurchaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class OrderService {

    private final CartItemRepository cartItemRepository;
    private final ProductRepository productRepository;
    private final OrderRepository orderRepository;
    private final ConsumerRepository consumerRepository;
    private final InventoryService inventoryService;
    private final PurchaseRepository purchaseRepository;
    private final ConsumerEventService consumerEventService;

    public OrderService(CartItemRepository cartItemRepository,
                        ProductRepository productRepository,
                        OrderRepository orderRepository,
                        ConsumerRepository consumerRepository,
                        InventoryService inventoryService,
                        PurchaseRepository purchaseRepository,
                        ConsumerEventService consumerEventService) {
        this.cartItemRepository = cartItemRepository;
        this.productRepository = productRepository;
        this.orderRepository = orderRepository;
        this.consumerRepository = consumerRepository;
        this.inventoryService = inventoryService;
        this.purchaseRepository = purchaseRepository;
        this.consumerEventService = consumerEventService;
    }

    @Transactional
    public OrderResponse checkout(Long consumerId) {
        List<CartItem> checkedItems = cartItemRepository.findByConsumerId(consumerId).stream()
                .filter(CartItem::isChecked)
                .toList();

        if (checkedItems.isEmpty()) {
            throw new IllegalStateException("결제할 상품이 선택되지 않았습니다.");
        }

        Consumer consumer = consumerRepository.findById(consumerId)
                .orElseThrow(() -> new IllegalStateException("존재하지 않는 회원입니다."));

        // member_id는 저장된 값이 아니라 계산값. 대응하는 members 행이 없으면(정상적으로는
        // 가입 시 항상 생김) 아래 purchases INSERT가 FK 위반으로 실패한다 — 의도된 동작(이정기팀원 확인).
        int memberId = Member.toMemberId(consumerId);

        Order order = new Order(consumerId);
        String basketId = UUID.randomUUID().toString();
        Instant purchasedAt = Instant.now();

        for (CartItem cartItem : checkedItems) {
            Product product = productRepository.findWithLockBySkuId(cartItem.getSkuId())
                    .orElseThrow(() -> new IllegalStateException("존재하지 않는 상품입니다. skuId=" + cartItem.getSkuId()));

            inventoryService.decreaseForSale(product.getSkuId(), cartItem.getQuantity());

            order.addItem(new OrderItem(
                    product.getSkuId(),
                    product.getName(),
                    product.getPriceKrw(),
                    cartItem.getQuantity()
            ));

            purchaseRepository.save(new Purchase(
                    basketId, memberId, product.getSkuId(),
                    cartItem.getQuantity(), product.getPriceKrw(), purchasedAt));
        }

        orderRepository.save(order);

        // session_id 개념이 아직 없어서 basketId로 대신함 (이전에 말씀드렸던 부분, 여전히 남아있음)
        consumerEventService.record(ConsumerEvent.EventType.PURCHASE, basketId,
                memberId, null, null, "{\"basketId\":\"" + basketId + "\"}");

        consumer.addSpend(order.getTotalAmount());

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
}