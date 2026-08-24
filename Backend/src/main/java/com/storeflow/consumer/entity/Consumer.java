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

    // 마케팅 정보 수신 동의(선택). 회원가입 시 새로 추가된 항목.
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

    /** 마이페이지 회원정보 수정(성별/생년월일). null이 오면 해당 필드는 바꾸지 않는다. */
    public void updateProfile(String gender, LocalDate birthDate) {
        if (gender != null) this.gender = gender;
        if (birthDate != null) this.birthDate = birthDate;
    }

    public void updateMarketingConsent(boolean marketingConsent) {
        this.marketingConsent = marketingConsent;
    }

    // 비밀번호 재설정 — 호출하는 쪽(ConsumerService)에서 이미 인코딩된 비밀번호를 넘겨야 한다.
    public void updatePassword(String encodedPassword) {
        this.password = encodedPassword;
        this.refreshToken = null; // 재설정 후 기존 로그인 세션은 전부 무효화
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

    public void addSpend(int amount) {
        this.monthlySpendAmount += amount;
        this.grade = Grade.calculateFrom(this.monthlySpendAmount);
    }

    public void resetMonthlySpend() {
        this.monthlySpendAmount = 0;
        this.grade = Grade.calculateFrom(0);
    }
}