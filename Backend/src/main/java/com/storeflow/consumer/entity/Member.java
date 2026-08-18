package com.storeflow.consumer.entity;

import jakarta.persistence.*;
import java.time.Instant;

/**
 * 스키마 v2.3 members 테이블. Agent 시드 가상회원과 같은 테이블을 공유한다.
 * 실사용자(consumer)의 member_id는 저장하지 않고 OFFSET + consumerId로 "계산"한다 —
 * FK로 이으면 schema_v2.sql의 DROP→CREATE 재적재가 막히기 때문(이정기팀원 확인 사항).
 * 시드 회원은 member_id < OFFSET만 쓰는 걸 Agent 쪽에서 보장한다.
 */
@Entity
@Table(name = "members")
public class Member {

    public static final int OFFSET = 10_000_000;

    @Id
    @Column(name = "member_id")
    private Integer memberId;

    @Column(name = "persona_type", nullable = false)
    private String personaType;

    @Column(name = "household_size")
    private Byte householdSize; // 실사용자는 가입 시 NULL — 마이페이지 등에서 나중에 채움

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Member() {}

    public Member(Integer memberId, String personaType, Byte householdSize, Instant createdAt) {
        this.memberId = memberId;
        this.personaType = personaType;
        this.householdSize = householdSize;
        this.createdAt = createdAt;
    }

    /** consumer_id로부터 member_id를 계산. 이 프로젝트에서 이 값을 구하는 방법은 이거 하나뿐이어야 함. */
    public static int toMemberId(Long consumerId) {
        return OFFSET + consumerId.intValue();
    }

    public Integer getMemberId() { return memberId; }
    public String getPersonaType() { return personaType; }
    public Byte getHouseholdSize() { return householdSize; }
    public Instant getCreatedAt() { return createdAt; }
}