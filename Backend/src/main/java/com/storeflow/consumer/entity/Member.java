package com.storeflow.consumer.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 스키마 v2.5 members 테이블. Agent 시드 가상회원과 같은 테이블을 공유한다.
 * 실사용자(consumer)의 member_id는 저장하지 않고 OFFSET + consumerId로 "계산"한다 —
 * FK로 이으면 schema_v2.sql의 DROP→CREATE 재적재가 막히기 때문(이정기팀원 확인 사항).
 * 시드 회원은 member_id < OFFSET만 쓰는 걸 Agent 쪽에서 보장한다.
 *
 * v2.5(2026-08-19): persona_type(문자열 라벨 1개) 폐기 → 속성 컬럼 4개로 분리.
 * 전부 NULL 허용. NULL(안 물어봄/건너뜀)과 FALSE("없다"고 답함)는 의미가 다르므로
 * 이 클래스에서 원시 boolean이 아닌 Boolean/Byte 래퍼 타입을 그대로 쓴다.
 */
@Entity
@Table(name = "members")
public class Member {

    public static final int OFFSET = 10_000_000;

    @Id
    @Column(name = "member_id")
    private Integer memberId;

    @Column(name = "household_size")
    private Byte householdSize; // 1~5(5="5명 이상"), NULL 허용

    @Column(name = "has_pet")
    private Boolean hasPet;

    @Column(name = "has_child")
    private Boolean hasChild;

    @Column(name = "by_car")
    private Boolean byCar;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Member() {}

    public Member(Integer memberId, Byte householdSize, Boolean hasPet, Boolean hasChild,
                  Boolean byCar, Instant createdAt) {
        this.memberId = memberId;
        this.householdSize = householdSize;
        this.hasPet = hasPet;
        this.hasChild = hasChild;
        this.byCar = byCar;
        this.createdAt = createdAt;
    }

    /** consumer_id로부터 member_id를 계산. 이 프로젝트에서 이 값을 구하는 방법은 이거 하나뿐이어야 함. */
    public static int toMemberId(Long consumerId) {
        return OFFSET + consumerId.intValue();
    }

    /** 마이페이지 회원정보 수정. null이 오면 해당 필드는 바꾸지 않는다(안 물어봄 vs 아니오 구분 유지). */
    public void updateProfile(Byte householdSize, Boolean hasPet, Boolean hasChild, Boolean byCar) {
        if (householdSize != null) this.householdSize = householdSize;
        if (hasPet != null) this.hasPet = hasPet;
        if (hasChild != null) this.hasChild = hasChild;
        if (byCar != null) this.byCar = byCar;
    }

    public Integer getMemberId() { return memberId; }
    public Byte getHouseholdSize() { return householdSize; }
    public Boolean getHasPet() { return hasPet; }
    public Boolean getHasChild() { return hasChild; }
    public Boolean getByCar() { return byCar; }
    public Instant getCreatedAt() { return createdAt; }
}