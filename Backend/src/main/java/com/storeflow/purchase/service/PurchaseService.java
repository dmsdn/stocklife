package com.storeflow.purchase.service;

import com.storeflow.consumer.entity.Member;
import com.storeflow.purchase.dto.CategoryPreferenceResponse;
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

    // 취향 추천용 카테고리 랭킹 기본 기간·개수. 인기상품 집계(90일)보다 넉넉히 잡는다 —
    // 개인 구매 빈도는 전체 인기 집계보다 표본이 작아서, 기간이 너무 짧으면 카테고리가 안 잡힌다.
    private static final int DEFAULT_PREFERENCE_LOOKBACK_DAYS = 180;
    private static final int DEFAULT_TOP_CATEGORY_LIMIT = 3;
    private static final int MAX_TOP_CATEGORY_LIMIT = 10;

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

    /**
     * 취향 추천 1단계 — 이 회원(memberId)이 최근 기간 동안 가장 많이 산 카테고리 상위 N개.
     * "청소용품을 많이 샀으면" 판단이 여기서 나온다. 실제 추천 상품(신상/행사)은 이 결과를
     * 받은 호출부(ai-server)가 search API로 다시 조회해서 채운다 — 이 메서드는 카테고리
     * 랭킹까지만 책임진다.
     * purchases는 세계 시드 테이블이라 memberId를 그대로 받는다 — consumerId를 받아
     * Member.toMemberId로 변환하면 이중 변환이 되어 존재하지 않는 memberId로 조회하게 된다
     * (호출부인 ai-server는 이미 세계 시드 memberId를 알고 있음).
     */
    @Transactional(readOnly = true)
    public List<CategoryPreferenceResponse> getTopCategories(Integer memberId, Integer lookbackDays, Integer limit) {
        Instant since = sinceFrom180(lookbackDays);
        int size = (limit == null || limit <= 0) ? DEFAULT_TOP_CATEGORY_LIMIT : Math.min(limit, MAX_TOP_CATEGORY_LIMIT);
        return purchaseRepository.findTopCategoriesByMemberId(memberId, since, PageRequest.of(0, size));
    }

    private Instant sinceFrom180(Integer lookbackDays) {
        int days = (lookbackDays == null || lookbackDays <= 0)
                ? DEFAULT_PREFERENCE_LOOKBACK_DAYS
                : Math.min(lookbackDays, MAX_LOOKBACK_DAYS);
        return Instant.now().minus(days, ChronoUnit.DAYS);
    }

    /**
     * 회원 구매 원장(/internal/purchases/history) — memberId로 직접 조회하며 시각순(오름차순)
     * 나열이다. /internal/orders/frequent는 orders(백엔드 고유)를 읽고 응답이 집계라 시각이
     * 없어 이 용도로 대체될 수 없다.
     */
    @Transactional(readOnly = true)
    public List<PurchaseHistoryResponse> getHistoryByMemberId(Integer memberId) {
        return purchaseRepository.findHistoryByMemberIdOrderByPurchasedAtAsc(memberId);
    }
}