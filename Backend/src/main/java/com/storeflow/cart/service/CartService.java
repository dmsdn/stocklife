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
    private static final String DEFAULT_GROUP_TITLE = "기본 장바구니";

    private final CartItemRepository cartItemRepository;
    private final CartGroupRepository cartGroupRepository;
    private final ProductRepository productRepository;
    private final StockRepository stockRepository;

    public CartService(CartItemRepository cartItemRepository,
            CartGroupRepository cartGroupRepository,
            ProductRepository productRepository,
            StockRepository stockRepository) {
        this.cartItemRepository = cartItemRepository;
        this.cartGroupRepository = cartGroupRepository;
        this.productRepository = productRepository;
        this.stockRepository = stockRepository;
    }

    /**
     * 09-08 재고 초과 담기 방지.
     *
     * 그동안 장바구니에는 재고 검증이 전혀 없었다. 그래서 수량 버튼을 계속 누르면
     * 매대에 31개뿐인 삼겹살을 141개까지 담을 수 있었고, 결제 단계에 가서야 재고 부족으로
     * 막히거나 아예 안 막혔다. 담는 시점에 거르는 것이 맞다.
     *
     * 상한은 PICK(진열대) 재고다. BULK(그 위 예비 재고)는 손님이 직접 집는 자리가 아니므로
     * 세지 않는다. 이 규칙은 시뮬레이션 쪽 "담기" 버튼의 캡과도 같은 기준이다.
     *
     * 초과하면 IllegalStateException 을 던진다. GlobalExceptionHandler 가 이걸
     * 409 Conflict 와 {"message": "..."} 형태로 바꿔주므로 프론트가 그 문구를 그대로
     * 화면에 띄울 수 있다.
     */
    private void requireWithinPickStock(Integer skuId, int requestedTotalQty) {
        if (requestedTotalQty <= 0) return;
        long available = stockRepository.sumPickQtyBySkuId(skuId, Location.TierRole.PICK);
        if (requestedTotalQty > available) {
            throw new IllegalStateException(
                    "진열대에 있는 수량보다 많이 담을 수 없습니다. 현재 남은 수량은 "
                            + available + "개입니다.");
        }
    }

    /** 기존 내부 API/AI 기능 호환용: 기본 장바구니에 담는다. */
    @Transactional
    public void addItem(Long consumerId, AddCartItemRequest request) {
        CartGroup group = getOrCreateDefaultGroup(consumerId);
        addItemToGroup(consumerId, group.getCartGroupId(), request);
    }

    @Transactional(readOnly = true)
    public List<CartItemResponse> getCart(Long consumerId) {
        return cartItemRepository.findByConsumerId(consumerId).stream().map(CartItemResponse::new).toList();
    }

    @Transactional(readOnly = true)
    public List<CartGroupResponse> getGroups(Long consumerId) {
        return cartGroupRepository.findByConsumerIdOrderByCartGroupIdAsc(consumerId).stream()
                .map(group -> new CartGroupResponse(
                        group,
                        cartItemRepository.findByCartGroupId(group.getCartGroupId()).stream()
                                .map(CartItemResponse::new).toList()))
                .toList();
    }

    @Transactional
    public CartGroupResponse createGroup(Long consumerId, CreateCartGroupRequest request) {
        CartGroup group = cartGroupRepository.save(new CartGroup(
                consumerId,
                request.getTitle().trim(),
                request.getDescription() == null ? "새 장보기 목록" : request.getDescription().trim(),
                request.getShoppingDate())); // 선택값 — 없으면 null 그대로 저장됨
        return new CartGroupResponse(group, List.of());
    }

    @Transactional(readOnly = true)
    public CartGroupResponse getGroup(Long consumerId, Long groupId) {
        CartGroup group = requireOwnedGroup(consumerId, groupId);
        List<CartItemResponse> items = cartItemRepository.findByCartGroupId(groupId).stream()
                .map(CartItemResponse::new).toList();
        return new CartGroupResponse(group, items);
    }

    @Transactional
    public CartGroupResponse updateGroup(Long consumerId, Long groupId, UpdateCartGroupRequest request) {
        CartGroup group = requireOwnedGroup(consumerId, groupId);
        group.updateInfo(request.getTitle(), request.getDescription());
        if (request.getShoppingDate() != null) {
            group.updateShoppingDate(request.getShoppingDate());
        }
        List<CartItemResponse> items = cartItemRepository.findByCartGroupId(groupId).stream()
                .map(CartItemResponse::new).toList();
        return new CartGroupResponse(group, items);
    }

    @Transactional
    public void deleteGroup(Long consumerId, Long groupId) {
        CartGroup group = requireOwnedGroup(consumerId, groupId);
        cartItemRepository.deleteByCartGroupId(groupId);
        cartGroupRepository.delete(group);
    }

    /**
     * 로그인 직후 프론트의 비회원 localStorage 장바구니를 회원 DB로 승계한다.
     * 동일 제목 그룹은 재사용하고, 같은 그룹의 동일 SKU는 수량을 더한다.
     * 요청 전체가 하나의 트랜잭션이므로 중간 실패 시 DB 변경은 롤백된다.
     */
    @Transactional
    public List<CartGroupResponse> migrateGuestCart(Long consumerId, MigrateGuestCartRequest request) {
        if (request == null || request.getGroups() == null || request.getGroups().isEmpty()) {
            return getGroups(consumerId);
        }

        for (MigrateGuestCartRequest.Group guestGroup : request.getGroups()) {
            if (guestGroup == null || guestGroup.getTitle() == null || guestGroup.getTitle().isBlank())
                continue;

            String title = guestGroup.getTitle().trim();
            CartGroup group = cartGroupRepository.findFirstByConsumerIdAndTitle(consumerId, title)
                    .orElseGet(() -> cartGroupRepository.save(new CartGroup(
                            consumerId,
                            title,
                            guestGroup.getDescription() == null ? "" : guestGroup.getDescription().trim())));

            if (guestGroup.getProducts() == null)
                continue;
            for (MigrateGuestCartRequest.Item guestItem : guestGroup.getProducts()) {
                if (guestItem == null || guestItem.getId() == null)
                    continue;
                // localStorage에 과거 목업 SKU가 남아 있어도 FK 오류로 전체 승계를 실패시키지 않는다.
                // 실제 products 테이블에 존재하는 상품만 회원 장바구니로 승계한다.
                if (!productRepository.existsById(guestItem.getId()))
                    continue;

                int qty = guestItem.getQuantity() == null ? 1 : Math.max(1, guestItem.getQuantity());
                boolean checked = guestItem.getChecked() == null || guestItem.getChecked();

                CartItem item = findAndMergeDuplicateItems(group.getCartGroupId(), guestItem.getId());
                if (item == null) {
                    cartItemRepository.save(new CartItem(group.getCartGroupId(), guestItem.getId(), qty, checked));
                } else {
                    item.increaseQuantity(qty);
                    item.toggleChecked(item.isChecked() || checked);
                }
            }
        }

        return getGroups(consumerId);
    }

    @Transactional(readOnly = true)
    public SessionCartResponse getSessionCart(Long consumerId) {
        return buildSessionCart(cartItemRepository.findByConsumerId(consumerId));
    }

    /**
     * cart_item.is_checked = true 인 항목만 모은 "실제 결제 대상" 장바구니.
     * 계산대 스캔 화면용 — 이 회원의 장바구니(모든 리스트 통틀어) 중 매장에서 실제로
     * 스캔/체크한 상품만 골라서 합계를 낸다. InternalCartController의
     * GET /internal/cart/scanned 에서 사용.
     */
    @Transactional(readOnly = true)
    public SessionCartResponse getScannedCart(Long consumerId) {
        List<CartItem> checkedItems = cartItemRepository.findByConsumerId(consumerId).stream()
                .filter(CartItem::isChecked)
                .toList();
        return buildSessionCart(checkedItems);
    }

    /**
     * 같은 그룹에 같은 SKU가 여러 줄로 남아 있는 구 DB 데이터를 한 줄로 복구한다.
     * 정상 스키마에서는 UNIQUE(cart_group_id, sku_id)로 애초에 중복 생성이 막힌다.
     */
    private CartItem findAndMergeDuplicateItems(Long groupId, Integer skuId) {
        List<CartItem> matches = cartItemRepository
                .findAllByCartGroupIdAndSkuIdOrderByCartItemIdAsc(groupId, skuId);

        if (matches.isEmpty())
            return null;

        CartItem keeper = matches.get(0);
        if (matches.size() == 1)
            return keeper;

        int mergedQuantity = 0;
        boolean mergedChecked = false;
        LocalDateTime latestScannedAt = null;

        for (CartItem item : matches) {
            mergedQuantity += item.getQuantity();
            mergedChecked = mergedChecked || item.isChecked();
            if (item.getScannedAt() != null &&
                    (latestScannedAt == null || item.getScannedAt().isAfter(latestScannedAt))) {
                latestScannedAt = item.getScannedAt();
            }
        }

        keeper.changeQuantity(mergedQuantity);
        keeper.toggleChecked(mergedChecked);
        if (latestScannedAt != null)
            keeper.markScanned(latestScannedAt);

        cartItemRepository.deleteAll(matches.subList(1, matches.size()));
        return keeper;
    }

    private CartGroup getOrCreateDefaultGroup(Long consumerId) {
        return cartGroupRepository.findFirstByConsumerIdAndTitle(consumerId, DEFAULT_GROUP_TITLE)
                .orElseGet(() -> cartGroupRepository.save(
                        new CartGroup(consumerId, DEFAULT_GROUP_TITLE, "기본 장바구니")));
    }

    private CartGroup requireOwnedGroup(Long consumerId, Long groupId) {
        return cartGroupRepository.findByCartGroupIdAndConsumerId(groupId, consumerId)
                .orElseThrow(() -> new IllegalStateException("장바구니 그룹을 찾을 수 없습니다."));
    }

    private void requireNotCompleted(CartGroup group) {
        if (group.isCompleted()) {
            throw new IllegalStateException("결제 완료된 리스트는 수정할 수 없습니다.");
        }
    }

    private void applyUpdate(CartItem cartItem, UpdateCartItemRequest request) {
        if (request.getQuantity() != null) {
            // 모바일 장바구니의 + 버튼이 지나가는 경로. 여기가 비어 있어서 141개까지 올라갔다.
            requireWithinPickStock(cartItem.getSkuId(), request.getQuantity());
            cartItem.changeQuantity(request.getQuantity());
        }
        if (request.getChecked() != null)
            cartItem.toggleChecked(request.getChecked());
    }

    private SessionCartResponse buildSessionCart(List<CartItem> items) {
        List<SessionCartItemResponse> itemResponses = new ArrayList<>();
        int total = 0;
        for (CartItem item : items) {
            Product product = productRepository.findById(item.getSkuId())
                    .orElseThrow(() -> new IllegalStateException("존재하지 않는 상품입니다. skuId=" + item.getSkuId()));
            int subtotal = product.getPriceKrw() * item.getQuantity();
            itemResponses.add(new SessionCartItemResponse(item, product, subtotal));
            total += subtotal;
        }
        return new SessionCartResponse(itemResponses, total);
    }

    @Transactional
    public CartItemResponse addItemToGroup(
            Long consumerId,
            Long groupId,
            AddCartItemRequest request
    ) {
        requireOwnedGroup(consumerId, groupId);

        // 이미 담겨 있던 수량에 이번에 담는 수량을 더한 "최종 수량"으로 검사한다.
        // 1개씩 여러 번 눌러서 상한을 넘기는 경우까지 막으려면 최종 수량 기준이어야 한다.
        int addQty = request.getQuantity() == null ? 1 : request.getQuantity();
        int alreadyInCart = cartItemRepository
                .findByCartGroupIdAndSkuId(groupId, request.getSkuId())
                .map(CartItem::getQuantity)
                .orElse(0);
        requireWithinPickStock(request.getSkuId(), alreadyInCart + addQty);

        CartItem item = cartItemRepository
                .findByCartGroupIdAndSkuId(
                        groupId,
                        request.getSkuId()
                )
                .map(existing -> {
                    existing.increaseQuantity(
                            request.getQuantity()
                    );
                    return existing;
                })
                .orElseGet(() ->
                        cartItemRepository.save(
                                new CartItem(
                                        groupId,
                                        request.getSkuId(),
                                        request.getQuantity()
                                )
                        )
                );

        return new CartItemResponse(item);
    }

    @Transactional
    public void updateItem(Long consumerId, Long cartItemId, UpdateCartItemRequest request) {
        CartItem item = cartItemRepository.findByCartItemIdAndConsumerId(cartItemId, consumerId)
                .orElseThrow(() -> new IllegalStateException("장바구니 항목을 찾을 수 없습니다."));
        requireNotCompleted(requireOwnedGroup(consumerId, item.getCartGroupId()));
        applyUpdate(item, request);
    }

    @Transactional
    public void deleteItem(Long consumerId, Long cartItemId) {
        CartItem item = cartItemRepository.findByCartItemIdAndConsumerId(cartItemId, consumerId)
                .orElseThrow(() -> new IllegalStateException("장바구니 항목을 찾을 수 없습니다."));
        requireNotCompleted(requireOwnedGroup(consumerId, item.getCartGroupId()));
        cartItemRepository.delete(item);
    }
}