package com.storeflow.wishlist.repository;

import com.storeflow.wishlist.dto.WishlistItemResponse;
import com.storeflow.wishlist.entity.Wishlist;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface WishlistRepository extends JpaRepository<Wishlist, Wishlist.WishlistId> {

    /** get_wishlist. 상품 정보까지 조인해서 바로 화면에 뿌릴 수 있는 형태로 반환. */
    @Query("""
        SELECT NEW com.storeflow.wishlist.dto.WishlistItemResponse(
            w.skuId, p.name, p.brand, p.priceKrw, p.imageUrl, w.addedAt)
        FROM Wishlist w, Product p
        WHERE w.memberId = :memberId AND w.skuId = p.skuId
        ORDER BY w.addedAt DESC
        """)
    List<WishlistItemResponse> findWishlistByMemberId(@Param("memberId") Integer memberId);
}