package com.storeflow.order.service;

import com.storeflow.cart.entity.CartItem;
import com.storeflow.cart.repository.CartItemRepository;
import com.storeflow.consumer.entity.Consumer;
import com.storeflow.consumer.entity.Member;
import com.storeflow.consumer.repository.ConsumerRepository;
import com.storeflow.order.dto.FrequentPurchaseResponse;
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
import com.storeflow.point.service.PointService;
import com.storeflow.coupon.service.CouponService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class OrderService {

        // "몇 번 이상 사야 '항상 구매하는' 상품으로 볼 것인가"의 기본값.
        // 1로 두면 딱 한 번 산 것도 걸리므로 최소 2번은 반복되어야 "항상"으로 인정한다.
        private static final long DEFAULT_MIN_PURCHASE_COUNT = 2;

        private final CartItemRepository cartItemRepository;
        private final ProductRepository productRepository;
        private final OrderRepository orderRepository;
        private final ConsumerRepository consumerRepository;
        private final InventoryService inventoryService;
        private final PurchaseRepository purchaseRepository;
        private final ConsumerEventService consumerEventService;
        private final PointService pointService;
        private final CouponService couponService;

        public OrderService(CartItemRepository cartItemRepository,
                            ProductRepository productRepository,
                            OrderRepository orderRepository,
                            ConsumerRepository consumerRepository,
                            InventoryService inventoryService,
                            PurchaseRepository purchaseRepository,
                            ConsumerEventService consumerEventService,
                            PointService pointService,
                            CouponService couponService) {
                this.cartItemRepository = cartItemRepository;
                this.productRepository = productRepository;
                this.orderRepository = orderRepository;
                this.consumerRepository = consumerRepository;
                this.inventoryService = inventoryService;
                this.purchaseRepository = purchaseRepository;
                this.consumerEventService = consumerEventService;
                this.pointService = pointService;
                this.couponService = couponService;
        }

        @Transactional
        public OrderResponse checkout(Long consumerId, Long consumerCouponId) {
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
                                .orElseThrow(() -> new IllegalStateException(
                                        "존재하지 않는 상품입니다. skuId=" + cartItem.getSkuId()));

                        inventoryService.decreaseForSale(product.getSkuId(), cartItem.getQuantity());

                        order.addItem(new OrderItem(
                                product.getSkuId(),
                                product.getName(),
                                product.getPriceKrw(),
                                cartItem.getQuantity()));

                        purchaseRepository.save(new Purchase(
                                basketId, memberId, product.getSkuId(),
                                cartItem.getQuantity(), product.getPriceKrw(), purchasedAt));
                }

                // 상품 합계가 확정된 뒤 쿠폰을 검증/계산한다.
                CouponService.AppliedCoupon appliedCoupon =
                        couponService.validateAndCalculate(consumerId, consumerCouponId, order.getOriginalAmount());
                order.applyCoupon(appliedCoupon.consumerCouponId(), appliedCoupon.discountAmount());

                orderRepository.save(order);
                couponService.markUsed(consumerId, appliedCoupon.consumerCouponId(), order.getOrderId());

                // session_id 개념이 아직 없어서 basketId로 대신함 (이전에 말씀드렸던 부분, 여전히 남아있음)
                consumerEventService.record(ConsumerEvent.EventType.PURCHASE, basketId,
                        memberId, null, null, "{\"basketId\":\"" + basketId + "\"}");

                consumer.addSpend(order.getTotalAmount());

                // 결제 완료 시 실결제 금액의 2%를 포인트로 적립한다.
                // PointService가 주문별 중복 적립도 방지한다.
                pointService.earnForPurchase(consumer, order);

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

        @Transactional
        public OrderResponse requestRefund(Long consumerId, Long orderId) {
                Order order = orderRepository.findByOrderIdAndConsumerId(orderId, consumerId)
                        .orElseThrow(() -> new IllegalStateException("주문을 찾을 수 없습니다."));
                order.requestRefund();
                return new OrderResponse(order);
        }

        /**
         * 환불 승인 처리. 관리자 화면이 범위 밖이라 별도 승인 권한 체계가 아직 없다 —
         * 데모 범위에서는 우선 본인 주문에 한해 호출 가능하게 열어둔다.
         * 나중에 운영자 승인 플로우가 필요해지면 이 메서드의 인증 방식만 바꾸면 된다.
         */
        @Transactional
        public OrderResponse approveRefund(Long consumerId, Long orderId) {
                Order order = orderRepository.findByOrderIdAndConsumerId(orderId, consumerId)
                        .orElseThrow(() -> new IllegalStateException("주문을 찾을 수 없습니다."));
                order.approveRefund();

                for (OrderItem item : order.getOrderItems()) {
                        inventoryService.restockForRefund(item.getSkuId(), item.getQuantity());
                }

                Consumer consumer = consumerRepository.findById(consumerId)
                        .orElseThrow(() -> new IllegalStateException("존재하지 않는 회원입니다."));

                // 환불된 실제 결제금액을 이번 달 구매 누적액에서 차감하고
                // 남은 누적 구매금액 기준으로 등급을 즉시 재계산한다.
                consumer.subtractSpend(order.getTotalAmount());

                pointService.revokeForRefund(consumer, order);
                couponService.restoreForRefund(order.getOrderId());

                return new OrderResponse(order);
        }
}