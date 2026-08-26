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

import java.util.ArrayList;
import java.util.List;

@Service
public class CartService {
    private static final String DEFAULT_GROUP_TITLE = "기본 장바구니";

    private final CartItemRepository cartItemRepository;
    private final CartGroupRepository cartGroupRepository;
    private final ProductRepository productRepository;

    public CartService(CartItemRepository cartItemRepository,
                       CartGroupRepository cartGroupRepository,
                       ProductRepository productRepository) {
        this.cartItemRepository = cartItemRepository;
        this.cartGroupRepository = cartGroupRepository;
        this.productRepository = productRepository;
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
                request.getDescription() == null ? "새 장보기 목록" : request.getDescription().trim()));
        return new CartGroupResponse(group, List.of());
    }

    @Transactional
    public void deleteGroup(Long consumerId, Long groupId) {
        CartGroup group = requireOwnedGroup(consumerId, groupId);
        cartItemRepository.deleteByCartGroupId(groupId);
        cartGroupRepository.delete(group);
    }

    @Transactional
    public CartItemResponse addItemToGroup(Long consumerId, Long groupId, AddCartItemRequest request) {
        requireOwnedGroup(consumerId, groupId);
        CartItem item = cartItemRepository.findByCartGroupIdAndSkuId(groupId, request.getSkuId())
                .map(existing -> {
                    existing.increaseQuantity(request.getQuantity());
                    return existing;
                })
                .orElseGet(() -> cartItemRepository.save(
                        new CartItem(groupId, request.getSkuId(), request.getQuantity())));
        return new CartItemResponse(item);
    }

    @Transactional
    public void updateItem(Long consumerId, Long cartItemId, UpdateCartItemRequest request) {
        CartItem item = cartItemRepository.findByCartItemIdAndConsumerId(cartItemId, consumerId)
                .orElseThrow(() -> new IllegalStateException("장바구니 항목을 찾을 수 없습니다."));
        applyUpdate(item, request);
    }

    @Transactional
    public void deleteItem(Long consumerId, Long cartItemId) {
        CartItem item = cartItemRepository.findByCartItemIdAndConsumerId(cartItemId, consumerId)
                .orElseThrow(() -> new IllegalStateException("장바구니 항목을 찾을 수 없습니다."));
        cartItemRepository.delete(item);
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
            if (guestGroup == null || guestGroup.getTitle() == null || guestGroup.getTitle().isBlank()) continue;

            String title = guestGroup.getTitle().trim();
            CartGroup group = cartGroupRepository.findFirstByConsumerIdAndTitle(consumerId, title)
                    .orElseGet(() -> cartGroupRepository.save(new CartGroup(
                            consumerId,
                            title,
                            guestGroup.getDescription() == null ? "" : guestGroup.getDescription().trim())));

            if (guestGroup.getProducts() == null) continue;
            for (MigrateGuestCartRequest.Item guestItem : guestGroup.getProducts()) {
                if (guestItem == null || guestItem.getId() == null) continue;
                // localStorage에 과거 목업 SKU가 남아 있어도 FK 오류로 전체 승계를 실패시키지 않는다.
                // 실제 products 테이블에 존재하는 상품만 회원 장바구니로 승계한다.
                if (!productRepository.existsById(guestItem.getId())) continue;

                int qty = guestItem.getQuantity() == null ? 1 : Math.max(1, guestItem.getQuantity());
                boolean checked = guestItem.getChecked() == null || guestItem.getChecked();

                CartItem item = cartItemRepository.findByCartGroupIdAndSkuId(group.getCartGroupId(), guestItem.getId())
                        .orElse(null);
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

    private CartGroup getOrCreateDefaultGroup(Long consumerId) {
        return cartGroupRepository.findFirstByConsumerIdAndTitle(consumerId, DEFAULT_GROUP_TITLE)
                .orElseGet(() -> cartGroupRepository.save(
                        new CartGroup(consumerId, DEFAULT_GROUP_TITLE, "기본 장바구니")));
    }

    private CartGroup requireOwnedGroup(Long consumerId, Long groupId) {
        return cartGroupRepository.findByCartGroupIdAndConsumerId(groupId, consumerId)
                .orElseThrow(() -> new IllegalStateException("장바구니 그룹을 찾을 수 없습니다."));
    }

    private void applyUpdate(CartItem cartItem, UpdateCartItemRequest request) {
        if (request.getQuantity() != null) cartItem.changeQuantity(request.getQuantity());
        if (request.getChecked() != null) cartItem.toggleChecked(request.getChecked());
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
}