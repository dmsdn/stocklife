package com.storeflow.cart.service;

import com.storeflow.cart.dto.*;
import com.storeflow.cart.entity.CartGroup;
import com.storeflow.cart.entity.CartItem;
import com.storeflow.cart.repository.CartGroupRepository;
import com.storeflow.cart.repository.CartItemRepository;
import com.storeflow.product.entity.Product;
import com.storeflow.product.repository.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class CartService {

    /**
     * 리스트를 직접 선택하지 않고 상품을 담을 때 사용하는 공용 장바구니.
     *
     * AI / 내부 API / Simulation 모두 이 그룹을 재사용한다.
     */
    private static final String QUICK_GROUP_TITLE = "빠른 장보기";

    private final CartItemRepository cartItemRepository;
    private final CartGroupRepository cartGroupRepository;
    private final ProductRepository productRepository;

    public CartService(
            CartItemRepository cartItemRepository,
            CartGroupRepository cartGroupRepository,
            ProductRepository productRepository
    ) {
        this.cartItemRepository = cartItemRepository;
        this.cartGroupRepository = cartGroupRepository;
        this.productRepository = productRepository;
    }

    /**
     * 리스트를 지정하지 않고 담을 때
     * "빠른 장보기" 그룹 하나를 가져오거나 새로 만든다.
     */
    @Transactional
    public void addItem(
            Long consumerId,
            AddCartItemRequest request
    ) {
        CartGroup group =
                getOrCreateQuickGroup(consumerId);

        addItemToGroup(
                consumerId,
                group.getCartGroupId(),
                request
        );
    }

    /**
     * 회원의 전체 장바구니 항목 조회.
     */
    @Transactional(readOnly = true)
    public List<CartItemResponse> getCart(
            Long consumerId
    ) {
        return cartItemRepository
                .findByConsumerId(consumerId)
                .stream()
                .map(CartItemResponse::new)
                .toList();
    }

    /**
     * 회원의 전체 장바구니 그룹 조회.
     */
    @Transactional(readOnly = true)
    public List<CartGroupResponse> getGroups(
            Long consumerId
    ) {
        return cartGroupRepository
                .findByConsumerIdOrderByCartGroupIdAsc(
                        consumerId
                )
                .stream()
                .map(group ->
                        new CartGroupResponse(
                                group,
                                cartItemRepository
                                        .findByCartGroupId(
                                                group.getCartGroupId()
                                        )
                                        .stream()
                                        .map(CartItemResponse::new)
                                        .toList()
                        )
                )
                .toList();
    }

    /**
     * 새 장바구니 그룹 생성.
     */
    @Transactional
    public CartGroupResponse createGroup(
            Long consumerId,
            CreateCartGroupRequest request
    ) {
        CartGroup group =
                cartGroupRepository.save(
                        new CartGroup(
                                consumerId,
                                request.getTitle().trim(),
                                request.getDescription() == null
                                        ? "새 장보기 목록"
                                        : request.getDescription().trim(),
                                request.getShoppingDate()
                        )
                );

        return new CartGroupResponse(
                group,
                List.of()
        );
    }

    /**
     * 장바구니 그룹 상세 조회.
     */
    @Transactional(readOnly = true)
    public CartGroupResponse getGroup(
            Long consumerId,
            Long groupId
    ) {
        CartGroup group =
                requireOwnedGroup(
                        consumerId,
                        groupId
                );

        List<CartItemResponse> items =
                cartItemRepository
                        .findByCartGroupId(groupId)
                        .stream()
                        .map(CartItemResponse::new)
                        .toList();

        return new CartGroupResponse(
                group,
                items
        );
    }

    /**
     * 장바구니 그룹 정보 수정.
     */
    @Transactional
    public CartGroupResponse updateGroup(
            Long consumerId,
            Long groupId,
            UpdateCartGroupRequest request
    ) {
        CartGroup group =
                requireOwnedGroup(
                        consumerId,
                        groupId
                );

        group.updateInfo(
                request.getTitle(),
                request.getDescription()
        );

        if (request.getShoppingDate() != null) {
            group.updateShoppingDate(
                    request.getShoppingDate()
            );
        }

        List<CartItemResponse> items =
                cartItemRepository
                        .findByCartGroupId(groupId)
                        .stream()
                        .map(CartItemResponse::new)
                        .toList();

        return new CartGroupResponse(
                group,
                items
        );
    }

    /**
     * 장바구니 그룹 삭제.
     */
    @Transactional
    public void deleteGroup(
            Long consumerId,
            Long groupId
    ) {
        CartGroup group =
                requireOwnedGroup(
                        consumerId,
                        groupId
                );

        cartItemRepository
                .deleteByCartGroupId(groupId);

        cartGroupRepository.delete(group);
    }

    /**
     * 로그인 직후 비회원 localStorage 장바구니를
     * 회원 DB 장바구니로 승계한다.
     *
     * 동일 제목 그룹은 재사용하고,
     * 같은 그룹 + 같은 SKU는 수량을 합친다.
     */
    @Transactional
    public List<CartGroupResponse> migrateGuestCart(
            Long consumerId,
            MigrateGuestCartRequest request
    ) {
        if (request == null
                || request.getGroups() == null
                || request.getGroups().isEmpty()) {

            return getGroups(consumerId);
        }

        for (MigrateGuestCartRequest.Group guestGroup
                : request.getGroups()) {

            if (guestGroup == null
                    || guestGroup.getTitle() == null
                    || guestGroup.getTitle().isBlank()) {
                continue;
            }

            String title =
                    guestGroup.getTitle().trim();

            CartGroup group =
                    cartGroupRepository
                            .findFirstByConsumerIdAndTitle(
                                    consumerId,
                                    title
                            )
                            .orElseGet(() ->
                                    cartGroupRepository.save(
                                            new CartGroup(
                                                    consumerId,
                                                    title,
                                                    guestGroup.getDescription() == null
                                                            ? ""
                                                            : guestGroup.getDescription().trim()
                                            )
                                    )
                            );

            if (guestGroup.getProducts() == null) {
                continue;
            }

            for (MigrateGuestCartRequest.Item guestItem
                    : guestGroup.getProducts()) {

                if (guestItem == null
                        || guestItem.getId() == null) {
                    continue;
                }

                /**
                 * 과거 localStorage 목업 SKU가 남아 있어도
                 * FK 오류로 전체 승계가 실패하지 않도록
                 * 실제 products 테이블에 존재하는 상품만 승계한다.
                 */
                if (!productRepository.existsById(
                        guestItem.getId()
                )) {
                    continue;
                }

                int qty =
                        guestItem.getQuantity() == null
                                ? 1
                                : Math.max(
                                1,
                                guestItem.getQuantity()
                        );

                boolean checked =
                        guestItem.getChecked() == null
                                || guestItem.getChecked();

                CartItem item =
                        findAndMergeDuplicateItems(
                                group.getCartGroupId(),
                                guestItem.getId()
                        );

                if (item == null) {
                    cartItemRepository.save(
                            new CartItem(
                                    group.getCartGroupId(),
                                    guestItem.getId(),
                                    qty,
                                    checked
                            )
                    );
                } else {
                    item.increaseQuantity(qty);

                    item.toggleChecked(
                            item.isChecked()
                                    || checked
                    );
                }
            }
        }

        return getGroups(consumerId);
    }

    /**
     * 현재 회원의 전체 장바구니를
     * 결제 화면용 상세 형태로 반환한다.
     */
    @Transactional(readOnly = true)
    public SessionCartResponse getSessionCart(
            Long consumerId
    ) {
        return buildSessionCart(
                cartItemRepository
                        .findByConsumerId(
                                consumerId
                        )
        );
    }

    /**
     * 실제 체크된 상품만 조회.
     */
    @Transactional(readOnly = true)
    public SessionCartResponse getScannedCart(
            Long consumerId
    ) {
        List<CartItem> checkedItems =
                cartItemRepository
                        .findByConsumerId(
                                consumerId
                        )
                        .stream()
                        .filter(CartItem::isChecked)
                        .toList();

        return buildSessionCart(
                checkedItems
        );
    }

    /**
     * 구 DB에 같은 그룹 + 같은 SKU가 여러 줄 남아 있으면
     * 하나의 CartItem으로 병합한다.
     */
    private CartItem findAndMergeDuplicateItems(
            Long groupId,
            Integer skuId
    ) {
        List<CartItem> matches =
                cartItemRepository
                        .findAllByCartGroupIdAndSkuIdOrderByCartItemIdAsc(
                                groupId,
                                skuId
                        );

        if (matches.isEmpty()) {
            return null;
        }

        CartItem keeper =
                matches.get(0);

        if (matches.size() == 1) {
            return keeper;
        }

        int mergedQuantity = 0;
        boolean mergedChecked = false;
        LocalDateTime latestScannedAt = null;

        for (CartItem item : matches) {

            mergedQuantity +=
                    item.getQuantity();

            mergedChecked =
                    mergedChecked
                            || item.isChecked();

            if (item.getScannedAt() != null
                    && (
                    latestScannedAt == null
                            || item.getScannedAt()
                            .isAfter(
                                    latestScannedAt
                            )
            )) {
                latestScannedAt =
                        item.getScannedAt();
            }
        }

        keeper.changeQuantity(
                mergedQuantity
        );

        keeper.toggleChecked(
                mergedChecked
        );

        if (latestScannedAt != null) {
            keeper.markScanned(
                    latestScannedAt
            );
        }

        cartItemRepository.deleteAll(
                matches.subList(
                        1,
                        matches.size()
                )
        );

        return keeper;
    }

    /**
     * ACTIVE 상태의 "빠른 장보기"가 있으면
     * 가장 먼저 생성된 그룹을 재사용한다.
     *
     * 없을 때만 새로 생성한다.
     */
    private CartGroup getOrCreateQuickGroup(
            Long consumerId
    ) {
        return cartGroupRepository
                .findFirstByConsumerIdAndTitleAndStatusNotOrderByCartGroupIdAsc(
                        consumerId,
                        QUICK_GROUP_TITLE,
                        CartGroup.Status.COMPLETED
                )
                .orElseGet(() ->
                        cartGroupRepository.save(
                                new CartGroup(
                                        consumerId,
                                        QUICK_GROUP_TITLE,
                                        "빠른 장보기"
                                )
                        )
                );
    }

    /**
     * 해당 소비자가 소유한 그룹인지 확인.
     */
    private CartGroup requireOwnedGroup(
            Long consumerId,
            Long groupId
    ) {
        return cartGroupRepository
                .findByCartGroupIdAndConsumerId(
                        groupId,
                        consumerId
                )
                .orElseThrow(() ->
                        new IllegalStateException(
                                "장바구니 그룹을 찾을 수 없습니다."
                        )
                );
    }

    /**
     * 이미 결제 완료된 그룹은 수정 금지.
     */
    private void requireNotCompleted(
            CartGroup group
    ) {
        if (group.isCompleted()) {
            throw new IllegalStateException(
                    "결제 완료된 리스트는 수정할 수 없습니다."
            );
        }
    }

    /**
     * 장바구니 항목 수정 공통 처리.
     */
    private void applyUpdate(
            CartItem cartItem,
            UpdateCartItemRequest request
    ) {
        if (request.getQuantity() != null) {
            cartItem.changeQuantity(
                    request.getQuantity()
            );
        }

        if (request.getChecked() != null) {
            cartItem.toggleChecked(
                    request.getChecked()
            );
        }
    }

    /**
     * 세션 장바구니 응답 생성.
     */
    private SessionCartResponse buildSessionCart(
            List<CartItem> items
    ) {
        List<SessionCartItemResponse> itemResponses =
                new ArrayList<>();

        int total = 0;

        for (CartItem item : items) {

            Product product =
                    productRepository
                            .findById(
                                    item.getSkuId()
                            )
                            .orElseThrow(() ->
                                    new IllegalStateException(
                                            "존재하지 않는 상품입니다. skuId="
                                                    + item.getSkuId()
                                    )
                            );

            int subtotal =
                    product.getPriceKrw()
                            * item.getQuantity();

            itemResponses.add(
                    new SessionCartItemResponse(
                            item,
                            product,
                            subtotal
                    )
            );

            total += subtotal;
        }

        return new SessionCartResponse(
                itemResponses,
                total
        );
    }

    /**
     * 특정 그룹에 상품 추가.
     *
     * 동일 groupId + skuId가 이미 존재하면
     * 새로운 행을 만들지 않고 quantity만 증가한다.
     */
    @Transactional
    public CartItemResponse addItemToGroup(
            Long consumerId,
            Long groupId,
            AddCartItemRequest request
    ) {
        CartGroup group =
                requireOwnedGroup(
                        consumerId,
                        groupId
                );

        requireNotCompleted(group);

        /**
         * 기존 구 DB에서 동일 SKU가 중복되어 있을 가능성까지 처리.
         */
        CartItem existing =
                findAndMergeDuplicateItems(
                        groupId,
                        request.getSkuId()
                );

        CartItem item;

        if (existing != null) {

            existing.increaseQuantity(
                    request.getQuantity()
            );

            item = existing;

        } else {

            item =
                    cartItemRepository.save(
                            new CartItem(
                                    groupId,
                                    request.getSkuId(),
                                    request.getQuantity()
                            )
                    );
        }

        return new CartItemResponse(item);
    }

    /**
     * 장바구니 항목 수정.
     */
    @Transactional
    public void updateItem(
            Long consumerId,
            Long cartItemId,
            UpdateCartItemRequest request
    ) {
        CartItem item =
                cartItemRepository
                        .findByCartItemIdAndConsumerId(
                                cartItemId,
                                consumerId
                        )
                        .orElseThrow(() ->
                                new IllegalStateException(
                                        "장바구니 항목을 찾을 수 없습니다."
                                )
                        );

        requireNotCompleted(
                requireOwnedGroup(
                        consumerId,
                        item.getCartGroupId()
                )
        );

        applyUpdate(
                item,
                request
        );
    }

    /**
     * 장바구니 항목 삭제.
     */
    @Transactional
    public void deleteItem(
            Long consumerId,
            Long cartItemId
    ) {
        CartItem item =
                cartItemRepository
                        .findByCartItemIdAndConsumerId(
                                cartItemId,
                                consumerId
                        )
                        .orElseThrow(() ->
                                new IllegalStateException(
                                        "장바구니 항목을 찾을 수 없습니다."
                                )
                        );

        requireNotCompleted(
                requireOwnedGroup(
                        consumerId,
                        item.getCartGroupId()
                )
        );

        cartItemRepository.delete(item);
    }
}