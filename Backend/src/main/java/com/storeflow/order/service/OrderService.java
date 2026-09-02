package com.storeflow.order.service;

import com.storeflow.point.entity.PointTransactionType;
import com.storeflow.point.service.PointService;
import com.storeflow.cart.entity.CartItem;
import com.storeflow.cart.repository.CartGroupRepository;
import com.storeflow.cart.repository.CartItemRepository;
import com.storeflow.consumer.entity.Consumer;
import com.storeflow.consumer.entity.Grade;
import com.storeflow.consumer.entity.Member;
import com.storeflow.consumer.repository.ConsumerRepository;
import com.storeflow.inventory.entity.ConsumerEvent;
import com.storeflow.inventory.service.ConsumerEventService;
import com.storeflow.inventory.service.InventoryService;
import com.storeflow.notification.service.NotificationService;
import com.storeflow.order.dto.FrequentPurchaseResponse;
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

        private static final long DEFAULT_MIN_PURCHASE_COUNT = 2;

        private final CartItemRepository cartItemRepository;
        private final CartGroupRepository cartGroupRepository;
        private final ProductRepository productRepository;
        private final OrderRepository orderRepository;
        private final ConsumerRepository consumerRepository;
        private final InventoryService inventoryService;
        private final PurchaseRepository purchaseRepository;
        private final ConsumerEventService consumerEventService;
        private final NotificationService notificationService;
        private final PointService pointService;

        public OrderService(
                CartItemRepository cartItemRepository,
                CartGroupRepository cartGroupRepository,
                ProductRepository productRepository,
                OrderRepository orderRepository,
                ConsumerRepository consumerRepository,
                InventoryService inventoryService,
                PurchaseRepository purchaseRepository,
                ConsumerEventService consumerEventService,
                NotificationService notificationService,
                PointService pointService
        ) {
                this.cartItemRepository = cartItemRepository;
                this.cartGroupRepository = cartGroupRepository;
                this.productRepository = productRepository;
                this.orderRepository = orderRepository;
                this.consumerRepository = consumerRepository;
                this.inventoryService = inventoryService;
                this.purchaseRepository = purchaseRepository;
                this.consumerEventService = consumerEventService;
                this.notificationService = notificationService;
                this.pointService = pointService;
        }

        @Transactional
        public OrderResponse checkout(
                Long consumerId,
                Long groupId,
                Integer pointsToUseOrNull
        ) {
                List<CartItem> allCheckedItems =
                        cartItemRepository.findByConsumerId(consumerId).stream()
                                .filter(CartItem::isChecked)
                                .toList();

                List<CartItem> checkedItems;

                if (groupId == null) {
                        checkedItems = allCheckedItems;
                } else {
                        cartGroupRepository
                                .findByCartGroupIdAndConsumerId(groupId, consumerId)
                                .orElseThrow(() ->
                                        new IllegalStateException(
                                                "장바구니 리스트를 찾을 수 없습니다."
                                        )
                                );

                        checkedItems = allCheckedItems.stream()
                                .filter(item ->
                                        groupId.equals(item.getCartGroupId())
                                )
                                .toList();
                }

                if (checkedItems.isEmpty()) {
                        throw new IllegalStateException(
                                "결제할 상품이 선택되지 않았습니다."
                        );
                }

                Consumer consumer =
                        consumerRepository.findById(consumerId)
                                .orElseThrow(() ->
                                        new IllegalStateException(
                                                "존재하지 않는 회원입니다."
                                        )
                                );

                int memberId = Member.toMemberId(consumerId);

                Order order = new Order(consumerId);

                String basketId =
                        UUID.randomUUID().toString();

                Instant purchasedAt =
                        Instant.now();

                for (CartItem cartItem : checkedItems) {

                        Product product =
                                productRepository
                                        .findWithLockBySkuId(
                                                cartItem.getSkuId()
                                        )
                                        .orElseThrow(() ->
                                                new IllegalStateException(
                                                        "존재하지 않는 상품입니다. skuId="
                                                                + cartItem.getSkuId()
                                                )
                                        );

                        inventoryService.decreaseForSale(
                                product.getSkuId(),
                                cartItem.getQuantity()
                        );

                        order.addItem(
                                new OrderItem(
                                        product.getSkuId(),
                                        product.getName(),
                                        product.getPriceKrw(),
                                        cartItem.getQuantity()
                                )
                        );

                        purchaseRepository.save(
                                new Purchase(
                                        basketId,
                                        memberId,
                                        product.getSkuId(),
                                        cartItem.getQuantity(),
                                        product.getPriceKrw(),
                                        purchasedAt
                                )
                        );
                }

                /*
                 * 포인트 사용
                 */
                int pointsToUse =
                        pointsToUseOrNull == null
                                ? 0
                                : pointsToUseOrNull;

                if (pointsToUse < 0) {
                        throw new IllegalArgumentException(
                                "사용 포인트는 0 이상이어야 합니다."
                        );
                }

                if (pointsToUse > order.getTotalAmount()) {
                        throw new IllegalStateException(
                                "사용 포인트가 결제 금액을 초과할 수 없습니다. "
                                        + "결제금액="
                                        + order.getTotalAmount()
                                        + ", 요청="
                                        + pointsToUse
                        );
                }

                /*
                 * 포인트 사용 직후 잔액을 저장한다.
                 * 이후 결제 적립 포인트가 더해지기 전의 잔액이다.
                 */
                int pointBalanceAfterUse =
                        consumer.getPointBalance();

                if (pointsToUse > 0) {

                        consumer.usePoints(pointsToUse);

                        order.applyPointsUsed(pointsToUse);

                        pointBalanceAfterUse =
                                consumer.getPointBalance();
                }

                orderRepository.save(order);

                if (pointsToUse > 0) {

                        pointService.record(
                                consumerId,
                                order.getOrderId(),
                                PointTransactionType.USE,
                                -pointsToUse,
                                consumer.getPointBalance(),
                                String.format(
                                        "주문 #%d에서 %,dP 사용",
                                        order.getOrderId(),
                                        pointsToUse
                                )
                        );
                }

                /*
                 * 구매 이벤트 저장
                 */
                consumerEventService.record(
                        ConsumerEvent.EventType.PURCHASE,
                        basketId,
                        memberId,
                        null,
                        null,
                        "{\"basketId\":\""
                                + basketId
                                + "\"}"
                );

                /*
                 * 포인트로 결제한 금액은
                 * 실제 현금 지출이 아니므로
                 * 포인트 적립 대상에서 제외한다.
                 */
                int netCashPaid =
                        order.getTotalAmount()
                                - pointsToUse;

                Grade gradeBefore =
                        consumer.getGrade();

                /*
                 * 결제 금액의 2% 포인트 적립
                 */
                int earnedPoints =
                        consumer.earnPoints(
                                netCashPaid
                        );

                Grade gradeAfter =
                        consumer.getGrade();

                order.applyPointsEarned(
                        earnedPoints
                );

                if (earnedPoints > 0) {

                        pointService.record(
                                consumerId,
                                order.getOrderId(),
                                PointTransactionType.EARN,
                                earnedPoints,
                                consumer.getPointBalance(),
                                String.format(
                                        "주문 #%d 결제로 %,dP 적립",
                                        order.getOrderId(),
                                        earnedPoints
                                )
                        );
                }

                /*
                 * 결제 완료 후
                 * 장바구니에서 상품 제거
                 */
                cartItemRepository.deleteAll(
                        checkedItems
                );

                /*
                 * 주문 완료 알림
                 */
                notificationService.createNotification(
                        consumerId,
                        "ORDER",
                        "주문이 완료됐어요",
                        String.format(
                                "%,d원 결제가 완료됐어요.",
                                order.getTotalAmount()
                        ),
                        "/orders/"
                                + order.getOrderId()
                );

                /*
                 * 포인트 사용 알림
                 *
                 * 실제로 포인트를 사용한 경우에만 생성한다.
                 */
                if (pointsToUse > 0) {

                        notificationService.createNotification(
                                consumerId,
                                "POINT",
                                "포인트를 사용했어요",
                                String.format(
                                        "이번 결제에서 %,dP를 사용했어요. "
                                                + "사용 후 남은 포인트는 %,dP예요.",
                                        pointsToUse,
                                        pointBalanceAfterUse
                                ),
                                null
                        );
                }

                /*
                 * 포인트 적립 알림
                 */
                if (earnedPoints > 0) {

                        notificationService.createNotification(
                                consumerId,
                                "POINT",
                                "포인트가 적립됐어요",
                                String.format(
                                        "이번 결제(%,d원)로 %,dP(2%%)가 적립됐어요.",
                                        netCashPaid,
                                        earnedPoints
                                ),
                                null
                        );
                }

                /*
                 * 등급 변경 알림
                 */
                if (gradeBefore != gradeAfter) {

                        notificationService.createNotification(
                                consumerId,
                                "GRADE",
                                "등급이 변경됐어요",
                                gradeBefore
                                        + " → "
                                        + gradeAfter
                                        + " 등급으로 변경됐어요.",
                                null
                        );
                }

                return new OrderResponse(order);
        }

        @Transactional(readOnly = true)
        public List<OrderResponse> getMyOrders(
                Long consumerId
        ) {
                return orderRepository
                        .findByConsumerIdOrderByCreatedAtDesc(
                                consumerId
                        )
                        .stream()
                        .map(OrderResponse::new)
                        .toList();
        }

        @Transactional(readOnly = true)
        public OrderResponse getOrderDetail(
                Long consumerId,
                Long orderId
        ) {
                Order order =
                        orderRepository
                                .findByOrderIdAndConsumerId(
                                        orderId,
                                        consumerId
                                )
                                .orElseThrow(() ->
                                        new IllegalStateException(
                                                "주문을 찾을 수 없습니다."
                                        )
                                );

                return new OrderResponse(order);
        }

        /*
         * 반복 구매 상품 조회
         */
        @Transactional(readOnly = true)
        public List<FrequentPurchaseResponse> getFrequentPurchases(
                Long consumerId,
                String keyword,
                Long minCount
        ) {
                String normalizedKeyword =
                        keyword == null
                                || keyword.isBlank()
                                ? null
                                : keyword.trim();

                long threshold =
                        minCount == null
                                || minCount < 1
                                ? DEFAULT_MIN_PURCHASE_COUNT
                                : minCount;

                return orderRepository
                        .findFrequentPurchases(
                                consumerId,
                                normalizedKeyword,
                                threshold
                        )
                        .stream()
                        .map(FrequentPurchaseResponse::new)
                        .toList();
        }

        /*
         * 환불 요청
         */
        @Transactional
        public OrderResponse requestRefund(
                Long consumerId,
                Long orderId
        ) {
                Order order =
                        orderRepository
                                .findByOrderIdAndConsumerId(
                                        orderId,
                                        consumerId
                                )
                                .orElseThrow(() ->
                                        new IllegalStateException(
                                                "주문을 찾을 수 없습니다."
                                        )
                                );

                order.requestRefund();

                notificationService.createNotification(
                        consumerId,
                        "ORDER",
                        "환불 요청이 접수됐어요",
                        "주문 #"
                                + order.getOrderId()
                                + " 환불 요청이 접수됐어요. "
                                + "승인까지 기다려주세요.",
                        "/orders/"
                                + order.getOrderId()
                );

                return new OrderResponse(order);
        }

        /*
         * 환불 승인
         */
        @Transactional
        public OrderResponse approveRefund(
                Long consumerId,
                Long orderId
        ) {
                Order order =
                        orderRepository
                                .findByOrderIdAndConsumerId(
                                        orderId,
                                        consumerId
                                )
                                .orElseThrow(() ->
                                        new IllegalStateException(
                                                "주문을 찾을 수 없습니다."
                                        )
                                );

                order.approveRefund();

                /*
                 * 재고 복구
                 */
                for (OrderItem item : order.getOrderItems()) {

                        inventoryService.restockForRefund(
                                item.getSkuId(),
                                item.getQuantity()
                        );
                }

                /*
                 * 포인트 복구
                 */
                Consumer consumer =
                        consumerRepository
                                .findById(consumerId)
                                .orElseThrow(() ->
                                        new IllegalStateException(
                                                "존재하지 않는 회원입니다."
                                        )
                                );

                /*
                 * 이 주문에서 적립됐던 포인트 취소
                 */
                if (order.getPointsEarned() > 0) {

                        consumer.reverseEarnedPoints(
                                order.getPointsEarned()
                        );

                        pointService.record(
                                consumerId,
                                order.getOrderId(),
                                PointTransactionType.REVERSE_EARN,
                                -order.getPointsEarned(),
                                consumer.getPointBalance(),
                                String.format(
                                        "주문 #%d 환불로 적립 포인트 %,dP 취소",
                                        order.getOrderId(),
                                        order.getPointsEarned()
                                )
                        );
                }

                /*
                 * 이 주문에서 사용했던 포인트 반환
                 */
                if (order.getPointsUsed() > 0) {

                        consumer.refundUsedPoints(
                                order.getPointsUsed()
                        );

                        pointService.record(
                                consumerId,
                                order.getOrderId(),
                                PointTransactionType.REFUND_USE,
                                order.getPointsUsed(),
                                consumer.getPointBalance(),
                                String.format(
                                        "주문 #%d 환불로 사용 포인트 %,dP 반환",
                                        order.getOrderId(),
                                        order.getPointsUsed()
                                )
                        );
                }

                /*
                 * 환불 완료 알림
                 */
                notificationService.createNotification(
                        consumerId,
                        "ORDER",
                        "환불이 완료됐어요",
                        "주문 #"
                                + order.getOrderId()
                                + " 환불이 승인·완료됐어요.",
                        "/orders/"
                                + order.getOrderId()
                );

                return new OrderResponse(order);
        }
}