package com.storeflow.purchase.service;

import com.storeflow.consumer.entity.Member;
import com.storeflow.purchase.dto.ProductPopularityResponse;
import com.storeflow.purchase.dto.PurchaseHistoryResponse;
import com.storeflow.purchase.repository.PurchaseRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
public class PurchaseService {

    // 집계 조회(타인 소비 데이터) 기본 조회 기간 — 너무 옛날 데이터까지 섞이면
    // "요즘 뭐가 잘 나가는지"라는 질문 취지와 어긋난다.
    private static final int DEFAULT_LOOKBACK_DAYS = 90;
    private static final int MAX_LOOKBACK_DAYS = 365;
    private static final int DEFAULT_POPULAR_LIMIT = 10;
    private static final int MAX_POPULAR_LIMIT = 50;

    private final PurchaseRepository purchaseRepository;

    public PurchaseService(PurchaseRepository purchaseRepository) {
        this.purchaseRepository = purchaseRepository;
    }

    /** member_id는 계산값(Member.toMemberId). 본인 구매내역 전용 — 개인정보라 그대로 노출. */
    @Transactional(readOnly = true)
    public List<PurchaseHistoryResponse> getPurchaseHistory(Long consumerId) {
        int memberId = Member.toMemberId(consumerId);
        return purchaseRepository.findHistoryByMemberId(memberId);
    }

    /**
     * "A샴푸보다 B샴푸가 더 잘 나가나?" — 상품 여러 개를 골라 전체 회원 기준 집계로 비교한다.
     * 개인 구매내역이 아니라 전 회원의 합계·구매자 수만 반환하므로 프라이버시 문제가 없다.
     */
    @Transactional(readOnly = true)
    public List<ProductPopularityResponse> compareProducts(List<Integer> skuIds, Integer lookbackDays) {
        if (skuIds == null || skuIds.isEmpty()) {
            throw new IllegalArgumentException("비교할 상품(skuId)을 1개 이상 지정해야 합니다.");
        }
        Instant since = sinceFrom(lookbackDays);
        return purchaseRepository.compareBySkuIds(skuIds, since);
    }

    /**
     * "다른 사람들은 보통 뭘 사?" — 카테고리(선택) 안에서 최근 인기 상품 상위 N개.
     * categoryL2가 null이면 전체 카테고리 대상.
     */
    @Transactional(readOnly = true)
    public List<ProductPopularityResponse> getPopularProducts(String categoryL2, Integer lookbackDays, Integer limit) {
        Instant since = sinceFrom(lookbackDays);
        int size = (limit == null || limit <= 0) ? DEFAULT_POPULAR_LIMIT : Math.min(limit, MAX_POPULAR_LIMIT);
        return purchaseRepository.findPopular(categoryL2, since, PageRequest.of(0, size));
    }

    private Instant sinceFrom(Integer lookbackDays) {
        int days = (lookbackDays == null || lookbackDays <= 0) ? DEFAULT_LOOKBACK_DAYS : Math.min(lookbackDays, MAX_LOOKBACK_DAYS);
        return Instant.now().minus(days, ChronoUnit.DAYS);
    }
}