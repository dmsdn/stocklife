package com.storeflow.purchase.service;

import com.storeflow.consumer.entity.Member;
import com.storeflow.purchase.dto.PurchaseHistoryResponse;
import com.storeflow.purchase.repository.PurchaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class PurchaseService {

    private final PurchaseRepository purchaseRepository;

    public PurchaseService(PurchaseRepository purchaseRepository) {
        this.purchaseRepository = purchaseRepository;
    }

    /** member_id는 계산값(Member.toMemberId). */
    @Transactional(readOnly = true)
    public List<PurchaseHistoryResponse> getPurchaseHistory(Long consumerId) {
        int memberId = Member.toMemberId(consumerId);
        return purchaseRepository.findHistoryByMemberId(memberId);
    }
}