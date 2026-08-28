package com.storeflow.wishlist.service;

import com.storeflow.consumer.entity.Member;
import com.storeflow.product.repository.ProductRepository;
import com.storeflow.wishlist.dto.WishlistItemResponse;
import com.storeflow.wishlist.entity.Wishlist;
import com.storeflow.wishlist.repository.WishlistRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

@Service
public class WishlistService {

    private final WishlistRepository wishlistRepository;
    private final ProductRepository productRepository;

    public WishlistService(WishlistRepository wishlistRepository, ProductRepository productRepository) {
        this.wishlistRepository = wishlistRepository;
        this.productRepository = productRepository;
    }

    /** member_id는 저장값이 아니라 계산값(Member.toMemberId) — consumer 패키지와 동일한 패턴. */
    @Transactional(readOnly = true)
    public List<WishlistItemResponse> getWishlist(Long consumerId) {
        int memberId = Member.toMemberId(consumerId);
        return wishlistRepository.findWishlistByMemberId(memberId);
    }

    /**
     * 내부 창구(/internal/wishlist) 전용 — 에이전트는 이미 세계 시드 memberId를 알고
     * 있으므로 변환 없이 그대로 받는다. consumerId 경유 변환을 태우면 0번 규약과 같은
     * 이중 변환 문제가 재발한다.
     */
    @Transactional(readOnly = true)
    public List<WishlistItemResponse> getWishlistByMemberId(Integer memberId) {
        return wishlistRepository.findWishlistByMemberId(memberId);
    }

    @Transactional
    public void addItem(Long consumerId, Integer skuId) {
        if (!productRepository.existsById(skuId)) {
            throw new IllegalStateException("존재하지 않는 상품입니다. skuId=" + skuId);
        }

        int memberId = Member.toMemberId(consumerId);
        Wishlist.WishlistId id = new Wishlist.WishlistId(memberId, skuId);

        if (wishlistRepository.existsById(id)) {
            return; // 이미 찜한 상품 — 에러 대신 그냥 멱등 처리
        }
        wishlistRepository.save(new Wishlist(memberId, skuId, Instant.now()));
    }

    @Transactional
    public void removeItem(Long consumerId, Integer skuId) {
        int memberId = Member.toMemberId(consumerId);
        wishlistRepository.deleteById(new Wishlist.WishlistId(memberId, skuId));
    }
}