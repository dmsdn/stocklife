package com.storeflow.inventory.repository;

import com.storeflow.inventory.entity.ConsumerEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConsumerEventRepository extends JpaRepository<ConsumerEvent, Long> {

    /**
     * 요구사항 29: 비회원 → 회원 데이터 승계.
     * 같은 sessionId로 남아있던 비회원 행동 기록(member_id IS NULL)을 로그인한 회원에게 연결한다.
     * 이미 memberId가 채워진 행(다른 계정으로 로그인 이력이 있는 세션 등)은 건드리지 않는다.
     */
    @Modifying
    @Query("UPDATE ConsumerEvent e SET e.memberId = :memberId " +
            "WHERE e.sessionId = :sessionId AND e.memberId IS NULL")
    int claimGuestEvents(@Param("sessionId") String sessionId, @Param("memberId") Integer memberId);
}