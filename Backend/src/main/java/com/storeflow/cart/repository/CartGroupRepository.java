package com.storeflow.cart.repository;

import com.storeflow.cart.entity.CartGroup;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CartGroupRepository extends JpaRepository<CartGroup, Long> {

    /**
     * 특정 소비자의 장바구니 그룹 전체 조회.
     * 오래된 그룹부터 정렬한다.
     */
    List<CartGroup> findByConsumerIdOrderByCartGroupIdAsc(Long consumerId);

    /**
     * 특정 소비자가 소유한 장바구니 그룹 조회.
     */
    Optional<CartGroup> findByCartGroupIdAndConsumerId(
            Long cartGroupId,
            Long consumerId
    );

    /**
     * 소비자 + 제목 기준 첫 번째 그룹 조회.
     * 기존 migrateGuestCart() 호환용.
     */
    Optional<CartGroup> findFirstByConsumerIdAndTitle(
            Long consumerId,
            String title
    );

    /**
     * "빠른 장보기"처럼 특정 제목의 그룹 중
     * COMPLETED 상태가 아닌 가장 오래된 그룹 하나를 조회한다.
     *
     * 이미 중복 그룹이 존재하더라도 항상 가장 먼저 생성된 그룹을 재사용한다.
     */
    Optional<CartGroup> findFirstByConsumerIdAndTitleAndStatusNotOrderByCartGroupIdAsc(
            Long consumerId,
            String title,
            CartGroup.Status status
    );
}