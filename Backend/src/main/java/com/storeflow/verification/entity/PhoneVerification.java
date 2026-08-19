package com.storeflow.verification.entity;

import jakarta.persistence.*;

import java.time.LocalDateTime;

/**
 * 전화번호 SMS 인증 레코드. phoneNumber + purpose 조합당 "살아있는" 레코드는 항상 최신 1건만 유지한다
 * (새 인증번호 발송 시 이전 레코드는 PhoneVerificationService에서 삭제).
 */
@Entity
@Table(name = "phone_verification")
public class PhoneVerification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "phone_number", nullable = false, length = 20)
    private String phoneNumber;

    @Column(name = "verification_code", nullable = false, length = 6)
    private String verificationCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "purpose", nullable = false, length = 20)
    private VerificationPurpose purpose;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "verified", nullable = false)
    private boolean verified = false;

    // 인증번호 5회 이상 오류 시 폐기 처리를 위한 실패 횟수 카운터
    @Column(name = "attempt_count", nullable = false)
    private int attemptCount = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected PhoneVerification() {
    }

    public PhoneVerification(String phoneNumber, String verificationCode,
            VerificationPurpose purpose, LocalDateTime expiresAt) {
        this.phoneNumber = phoneNumber;
        this.verificationCode = verificationCode;
        this.purpose = purpose;
        this.expiresAt = expiresAt;
        this.createdAt = LocalDateTime.now();
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
    }

    public static final int MAX_ATTEMPTS = 5;

    public boolean isExpired() {
        return LocalDateTime.now().isAfter(expiresAt);
    }

    public boolean isDiscarded() {
        return attemptCount >= MAX_ATTEMPTS;
    }

    /** 인증번호 불일치 1회 기록. 5회째에 도달하면 폐기 상태가 된다(isDiscarded()=true). */
    public void recordFailedAttempt() {
        this.attemptCount++;
    }

    public void markVerified() {
        this.verified = true;
    }

    public Long getId() {
        return id;
    }

    public String getPhoneNumber() {
        return phoneNumber;
    }

    public String getVerificationCode() {
        return verificationCode;
    }

    public VerificationPurpose getPurpose() {
        return purpose;
    }

    public LocalDateTime getExpiresAt() {
        return expiresAt;
    }

    public boolean isVerified() {
        return verified;
    }

    public int getAttemptCount() {
        return attemptCount;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}