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

    @Column(name = "password", nullable = false)
    private String password; // 암호화된 값 저장

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

    @Column(name = "refresh_token")
    private String refreshToken; // 로그아웃 시 null 처리

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "grade", nullable = false)
    private Grade grade = Grade.BASIC;

    @Column(name = "monthly_spend_amount", nullable = false)
    private int monthlySpendAmount = 0;

    protected Consumer() {} // JPA 기본 생성자

    public Consumer(String phoneNumber, String password, String gender, LocalDate birthDate,
                     boolean cameraConsent, boolean personalInfoConsent, boolean micConsent) {
        this.phoneNumber = phoneNumber;
        this.password = password;
        this.gender = gender;
        this.birthDate = birthDate;
        this.cameraConsent = cameraConsent;
        this.personalInfoConsent = personalInfoConsent;
        this.micConsent = micConsent;
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

    // getters
    public Long getConsumerId() { return consumerId; }
    public String getPhoneNumber() { return phoneNumber; }
    public String getPassword() { return password; }
    public String getGender() { return gender; }
    public LocalDate getBirthDate() { return birthDate; }
    public boolean isCameraConsent() { return cameraConsent; }
    public boolean isPersonalInfoConsent() { return personalInfoConsent; }
    public boolean isMicConsent() { return micConsent; }
    public String getRefreshToken() { return refreshToken; }
    public Grade getGrade() { return grade; }
    public int getMonthlySpendAmount() { return monthlySpendAmount; }


    public void addSpend(int amount) {
        this.monthlySpendAmount += amount;
        this.grade = Grade.calculateFrom(this.monthlySpendAmount);
    }
}

