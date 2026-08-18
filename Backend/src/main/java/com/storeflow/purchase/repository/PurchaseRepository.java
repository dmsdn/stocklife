package com.storeflow.purchase.repository;

import com.storeflow.purchase.dto.PurchaseHistoryResponse;
import com.storeflow.purchase.entity.Purchase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PurchaseRepository extends JpaRepository<Purchase, Long> {

    /** get_purchase_history. 상품명·이미지까지 조인해서 반환. */
    @Query("""
        SELECT NEW com.storeflow.purchase.dto.PurchaseHistoryResponse(
            p.purchaseId, p.skuId, pr.name, pr.imageUrl, p.qty, p.unitPriceKrw, p.purchasedAt)
        FROM Purchase p, Product pr
        WHERE p.memberId = :memberId AND p.skuId = pr.skuId
        ORDER BY p.purchasedAt DESC
        """)
    List<PurchaseHistoryResponse> findHistoryByMemberId(@Param("memberId") Integer memberId);
}