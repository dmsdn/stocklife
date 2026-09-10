package com.storeflow.cart.service;

import com.storeflow.cart.dto.*;
import com.storeflow.cart.entity.CartGroup;
import com.storeflow.cart.entity.CartItem;
import com.storeflow.cart.repository.CartGroupRepository;
import com.storeflow.cart.repository.CartItemRepository;
import com.storeflow.inventory.entity.Location;
import com.storeflow.inventory.repository.StockRepository;
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
    private final StockRepository stockRepository;

    public CartService(
            CartItemRepository cartItemRepository,
            CartGroupRepository cartGroupRepository,
            ProductRepository productRepository,
            StockRepository stockRepository
    ) {
        this.cartItemRepository = cartItemRepository;
        this.cartGroupRepository = cartGroupRepository;
        this.productRepository = productRepository;
        this.stockRepository = stockRepository;
    }

    /**
     * 09-08 재고 초과 담기 방지.
     *
     * 그동안 장바구니에는 재고 검증이 전혀 없었다. 그래서 수량 버튼을 계속 누르면
     * 매대에 31개뿐인 삼겹살을 141개까지 담을 수 있었다. 담는 시점에 거르는 것이 맞다.
     *
     * 상한은 PICK(진열대) 재고다. BULK(그 위 예비 재고)는 손님이 직접 집는 자리가 아니므로
     * 세지 않는다. 시뮬레이션 쪽 "담기" 버튼의 캡과 같은 기준이다.
     *
     * 초과하면 IllegalStateException 을 던진다. GlobalExceptionHandler 가 이걸
     * 409 Conflict 와 {"message": "..."} 형태로 바꿔주므로 프론트가 그 문구를 그대로
     * 화면에 띄울 수 있다.
     */
    private void requireWithinPickStock(
            Integer skuId,
            int requestedTotalQty
    ) {
        if (requestedTotalQty <= 0) {
            return;
        }

        long available =
                stockRepository.sumPickQtyBySkuId(
                        skuId,
                        Location.TierRole.PICK
                );

        if (requestedTotalQty > available) {
            throw new IllegalStateException(
                    "진열대에 있는 수량보다 많이 담을 수 없습니다. 현재 남은 수량은 "
                            + available + "개입니다."
            );
        }
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
    /**
     * 스캔 상태 전이 (09-10 프론트 요청서).
     *
     * [무엇을 뜻하는가] scanned_at 이 비어 있으면 "리스트에 계획만 해둔 것", 차 있으면
     * "매장에서 실제로 집어서 찍은 것"이다. 그래서 같은 quantity 라도 뜻이 다르다 —
     * 계획 상태의 2는 "두 개 사야지"이고, 스캔 상태의 2는 "두 번 찍었다"이다.
     *
     * [왜 계획 수량을 버리는가] 계획을 2개로 해뒀는데 매장에서 하나만 집었다면, 계획값을
     * 그대로 두면 안 집은 한 개까지 결제된다. 그래서 처음 찍히는 순간 1로 되돌리고 그
     * 뒤로는 찍은 횟수만 센다. 계획 수량은 참고용으로만 남는다.
     *
     * [왜 요청의 quantity 를 무시하는가] 스캔 수량을 클라이언트가 계산해 보내면, 같은
     * 요청이 두 번 도착하거나 화면이 잠깐 옛 값을 들고 있을 때 개수가 조용히 어긋난다.
     * 서버가 "찍힌 횟수"로만 세면 그런 어긋남이 생길 자리가 없다.
     */
    private void applyScanTransition(CartItem cartItem, boolean scanned) {
        if (!scanned) {
            // 계획 상태로 되돌린다. 수량은 그대로 둔다 — 되돌린 뒤 사용자가 계획 수량을
            // 다시 잡을 수 있어야 하는데, 여기서 1로 만들어버리면 그 값이 사라진다.
            cartItem.markScanned(null);
            return;
        }

        if (cartItem.getScannedAt() == null) {
            // 계획 → 스캔. 계획 수량을 버리고 실제로 집은 개수부터 다시 센다.
            cartItem.markScanned(LocalDateTime.now());
            cartItem.changeQuantity(1);
            return;
        }

        // 이미 스캔된 것을 또 찍었다 = 하나 더 집었다.
        // 늘리는 요청이므로 매대 재고 상한 검사는 그대로 태운다 — 스캔 경로만 예외를 두면
        // 담기에서 막아둔 상한을 이 문으로 우회할 수 있다.
        requireWithinPickStock(
                cartItem.getSkuId(),
                cartItem.getQuantity() + 1
        );
        cartItem.increaseQuantity(1);
    }

    private void applyUpdate(
            CartItem cartItem,
            UpdateCartItemRequest request
    ) {
        // scanned 가 왔으면 수량은 이쪽이 정한다 — 아래 quantity 분기는 건너뛴다.
        if (request.getScanned() != null) {
            applyScanTransition(cartItem, request.getScanned());

            if (request.getChecked() != null) {
                cartItem.toggleChecked(request.getChecked());
            }
            return;
        }

        if (request.getQuantity() != null) {
            // 모바일 장바구니의 + 버튼이 지나가는 경로. 여기가 비어 있어서 141개까지 올라갔다.
            //
            // ⚠ "늘리는 경우"에만 막는다. 재고 검증이 없던 시절에 이미 상한을 넘겨 담긴
            //    항목이 남아 있는데, 줄이는 것까지 막아버리면 사용자가 그 항목을 정리할
            //    방법이 없어진다(123개를 122개로 줄이는 것도 거부되는 상황).
            //    같은 값이거나 줄이는 요청은 언제나 허용한다.
            if (request.getQuantity() > cartItem.getQuantity()) {
                requireWithinPickStock(
                        cartItem.getSkuId(),
                        request.getQuantity()
                );
            }

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

        // 09-10: 스캔으로 담는 경로. 스캔은 언제나 한 개부터이므로 요청의 quantity 는 쓰지
        // 않는다. 이미 담겨 있던 항목이면 PATCH 와 똑같은 전이를 태운다 — 담기와 수정이
        // 서로 다르게 동작하면 "새 상품인지 아닌지"를 부르는 쪽이 먼저 알아야 하고,
        // 그 판단이 틀리는 순간 개수가 어긋난다.
        if (Boolean.TRUE.equals(request.getScanned())) {

            if (existing != null) {
                applyScanTransition(existing, true);
                return new CartItemResponse(existing);
            }

            requireWithinPickStock(request.getSkuId(), 1);

            CartItem scannedItem = new CartItem(groupId, request.getSkuId(), 1);
            scannedItem.markScanned(LocalDateTime.now());

            return new CartItemResponse(
                    cartItemRepository.save(scannedItem));
        }

        // 이미 담겨 있던 수량에 이번에 담는 수량을 더한 "최종 수량"으로 검사한다.
        // 1개씩 여러 번 눌러서 상한을 넘기는 경우까지 막으려면 최종 수량 기준이어야 한다.
        // 위에서 중복 병합을 마친 existing 을 그대로 쓰므로 조회가 늘지 않는다.
        // AddCartItemRequest.getQuantity() 는 기본형 int 이고 기본값이 1, @Min(1) 이 걸려 있다.
        // (UpdateCartItemRequest 쪽만 Integer 라서 null 검사가 필요하다 — 둘을 헷갈리지 말 것)
        int addQty = request.getQuantity();

        int alreadyInCart =
                existing == null
                        ? 0
                        : existing.getQuantity();

        requireWithinPickStock(
                request.getSkuId(),
                alreadyInCart + addQty
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