package com.storeflow.consumer.entity;

import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "consumer")
public class Consumer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "consumer_id")
    private Long consumerId;

    @Column(name = "phone_number", nullable = false, unique = true, length = 20)
    private String phoneNumber;

    @Column(name = "name", nullable = false, length = 50)
    private String name;

    @Column(name = "password", nullable = false)
    private String password;

    @Column(name = "gender", length = 10)
    private String gender;

    @Column(name = "birth_date")
    private LocalDate birthDate;

    @Column(name = "camera_consent", nullable = false)
    private boolean cameraConsent;

    @Column(name = "personal_info_consent", nullable = false)
    private boolean personalInfoConsent;

    @Column(name = "mic_consent", nullable = false)
    private boolean micConsent;

    @Column(name = "marketing_consent", nullable = false)
    private boolean marketingConsent;

    @Column(name = "refresh_token")
    private String refreshToken;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "grade", nullable = false)
    private Grade grade = Grade.BASIC;

    @Column(name = "monthly_spend_amount", nullable = false)
    private int monthlySpendAmount = 0;

    /** 1P = 1원. 구매 완료 금액의 2%를 누적한다. */
    @Column(name = "point_balance", nullable = false)
    private int pointBalance = 0;

    @Column(name = "withdrawn_at")
    private LocalDateTime withdrawnAt;

    protected Consumer() {}

    public Consumer(String phoneNumber, String name, String password, String gender, LocalDate birthDate,
                    boolean cameraConsent, boolean personalInfoConsent, boolean micConsent,
                    boolean marketingConsent) {
        this.phoneNumber = phoneNumber;
        this.name = name;
        this.password = password;
        this.gender = gender;
        this.birthDate = birthDate;
        this.cameraConsent = cameraConsent;
        this.personalInfoConsent = personalInfoConsent;
        this.micConsent = micConsent;
        this.marketingConsent = marketingConsent;
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public void updateRefreshToken(String refreshToken) {
        this.refreshToken = refreshToken;
    }

    public void updateProfile(String gender, LocalDate birthDate) {
        if (gender != null) this.gender = gender;
        if (birthDate != null) this.birthDate = birthDate;
    }

    public void updateMarketingConsent(boolean marketingConsent) {
        this.marketingConsent = marketingConsent;
    }

    public boolean isWithdrawn() {
        return withdrawnAt != null;
    }

    public void withdraw(String tombstonePhoneNumber, String randomizedPassword) {
        this.withdrawnAt = LocalDateTime.now();
        this.phoneNumber = tombstonePhoneNumber;
        this.password = randomizedPassword;
        this.refreshToken = null;
    }

    public void updatePassword(String encodedPassword) {
        this.password = encodedPassword;
        this.refreshToken = null;
    }

    public void addPoints(int points) {
        if (points < 0) throw new IllegalArgumentException("적립 포인트는 0 이상이어야 합니다.");
        this.pointBalance += points;
    }

    public void subtractPoints(int points) {
        if (points < 0) throw new IllegalArgumentException("차감 포인트는 0 이상이어야 합니다.");
        this.pointBalance = Math.max(0, this.pointBalance - points);
    }

    public Long getConsumerId() { return consumerId; }
    public String getPhoneNumber() { return phoneNumber; }
    public String getName() { return name; }
    public String getPassword() { return password; }
    public String getGender() { return gender; }
    public LocalDate getBirthDate() { return birthDate; }
    public boolean isCameraConsent() { return cameraConsent; }
    public boolean isPersonalInfoConsent() { return personalInfoConsent; }
    public boolean isMicConsent() { return micConsent; }
    public boolean isMarketingConsent() { return marketingConsent; }
    public String getRefreshToken() { return refreshToken; }
    public Grade getGrade() { return grade; }
    public int getMonthlySpendAmount() { return monthlySpendAmount; }
    public int getPointBalance() { return pointBalance; }

    public void addSpend(int amount) {
        if (amount < 0) {
            throw new IllegalArgumentException("구매 금액은 0 이상이어야 합니다.");
        }
        this.monthlySpendAmount += amount;
        this.grade = Grade.calculateFrom(this.monthlySpendAmount);
    }

    /**
     * 환불 승인 시 이번 달 누적 구매금액에서 실제 결제금액을 차감하고
     * 남은 누적 구매금액을 기준으로 회원 등급을 즉시 다시 계산한다.
     */
    public void subtractSpend(int amount) {
        if (amount < 0) {
            throw new IllegalArgumentException("차감 금액은 0 이상이어야 합니다.");
        }
        this.monthlySpendAmount = Math.max(0, this.monthlySpendAmount - amount);
        this.grade = Grade.calculateFrom(this.monthlySpendAmount);
    }

    public void resetMonthlySpend() {
        this.monthlySpendAmount = 0;
        this.grade = Grade.calculateFrom(0);
    }
}