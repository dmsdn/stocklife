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

    // 회원탈퇴 시각. null이면 정상 회원. phone_number가 UNIQUE라서 완전 삭제 대신
    // 이 컬럼으로 소프트 삭제하고, 전화번호는 재가입 가능하도록 tombstone 값으로 바꿔둔다.
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

    /** 마이페이지 회원정보 수정(성별/생년월일). null이 오면 해당 필드는 바꾸지 않는다. */
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

    /**
     * 회원탈퇴(소프트 삭제). 전화번호는 UNIQUE 제약이 있어 그대로 두면 이 사람이 같은 번호로
     * 다시 가입할 수 없으므로, tombstone 값으로 바꿔서 원래 번호를 반환(release)한다.
     * 로그인도 막아야 하므로 refreshToken도 함께 지운다. 비밀번호는 재로그인 자체가 막히므로
     * 그대로 둬도 되지만, 혹시 모를 사고를 대비해 인코딩된 랜덤 값으로 덮어쓴다.
     */
    public void withdraw(String tombstonePhoneNumber, String randomizedPassword) {
        this.withdrawnAt = LocalDateTime.now();
        this.phoneNumber = tombstonePhoneNumber;
        this.password = randomizedPassword;
        this.refreshToken = null;
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