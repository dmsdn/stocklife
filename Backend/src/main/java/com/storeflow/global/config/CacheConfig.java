package com.storeflow.global.config;

import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 09-08 성능. 이 환경은 DB 왕복 한 번이 약 195ms다(같은 구간의 TCP 연결은 6ms인데도 그렇다).
 * 그래서 응답 시간은 쿼리가 무겁냐가 아니라 "왕복을 몇 번 하느냐"로 결정된다.
 * 장바구니 화면 하나가 3초 걸리던 것도 상품을 하나씩 조회하느라 왕복이 여러 번 일어나서였다.
 *
 * 상품 마스터 정보(이름, 가격, 이미지, 프로모션)는 시연 중에 바뀌지 않으므로 메모리에 담아
 * 두 번째 조회부터는 왕복을 아예 없앤다.
 *
 * ⚠ 여기에 재고를 넣으면 안 된다. 재고는 캐릭터가 상품을 집을 때마다 바뀌어야 하고,
 *   캐시에 걸리면 화면이 갱신되지 않아 시연이 깨진다. 재고/장바구니/구매내역/채팅은
 *   의도적으로 캐시 대상에서 제외했다.
 *
 * TTL이 없는 단순 맵 캐시라서 값을 비우려면 백엔드를 재시작하면 된다. 상품 데이터를
 * 다시 적재했는데 화면에 옛 값이 보인다면 재시작이 먼저다.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    /** 상품 상세. 키는 skuId. 최대 상품 수(약 5천)만큼만 쌓이므로 메모리 상한이 예측 가능하다. */
    public static final String PRODUCT_DETAIL = "productDetail";

    /** 전체 대분류 목록. 항목 하나짜리 캐시. */
    public static final String CATEGORY_L1 = "categoryL1";

    @Bean
    public CacheManager cacheManager() {
        return new ConcurrentMapCacheManager(PRODUCT_DETAIL, CATEGORY_L1);
    }
}
