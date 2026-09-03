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

    // 사용 가능한 포인트 잔액 — 포인트 사용(차감) 시 줄어든다.
    @Column(name = "point_balance", nullable = false)
    private int pointBalance = 0;

    // 평생 누적 적립 포인트 — 사용해도 줄지 않는다. 등급은 이 값을 기준으로 계산한다
    // (5-4: monthlySpendAmount/매달 리셋 방식 폐기, 누적이라 리셋 개념 자체가 없음).
    @Column(name = "point_earned_total", nullable = false)
    private int pointEarnedTotal = 0;

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
    public int getPointBalance() { return pointBalance; }
    public int getPointEarnedTotal() { return pointEarnedTotal; }

    // 적립률 2%. 결제 금액(원)을 받아 포인트로 환산해 적립하고, 실제 적립된 포인트 수를 반환한다.
    // 등급은 적립 직후 즉시(스케줄러 없이) 누적 포인트 기준으로 재계산한다.
    private static final double POINT_EARN_RATE = 0.02;

    public int earnPoints(int paymentAmountKrw) {
        int earned = (int) Math.floor(paymentAmountKrw * POINT_EARN_RATE);
        this.pointBalance += earned;
        this.pointEarnedTotal += earned;
        this.grade = Grade.calculateFrom(this.pointEarnedTotal);
        return earned;
    }

    /**
     * 포인트 사용(차감). 5-3: checkout에서 결제 시 사용할 포인트 수량을 검증 후 차감한다.
     * 잔액(pointBalance)만 줄이고 누적 적립(pointEarnedTotal)은 그대로 둬서 등급에 영향 없음.
     */
    public void usePoints(int amount) {
        if (amount <= 0) return;
        if (amount > this.pointBalance) {
            throw new IllegalStateException("포인트 잔액이 부족합니다. 잔액=" + pointBalance + ", 요청=" + amount);
        }
        this.pointBalance -= amount;
    }

    /**
     * 환불 시 "사용했던 포인트"를 잔액으로 되돌린다. 이건 새로 적립되는 게 아니라
     * 원래 있던 걸 되돌려주는 것뿐이라 pointEarnedTotal(등급 산정용 누적)은 건드리지 않는다.
     */
    public void refundUsedPoints(int amount) {
        if (amount <= 0) return;
        this.pointBalance += amount;
    }

    /**
     * 환불 시 "이 결제로 적립됐던 포인트"를 취소한다. 애초에 정상적으로 적립된 게 아니게
     * 되므로 잔액과 누적 적립 둘 다 줄이고, 등급도 취소 후 기준으로 다시 계산한다.
     * 이미 다른 데 써버려서 잔액이 부족한 경우엔 잔액은 0까지만 깎는다(음수 방지) —
     * 데모 범위에서는 이 정도로 충분하고, 실서비스라면 "포인트 마이너스 잔액" 정책을 정해야 함.
     */
    public void reverseEarnedPoints(int amount) {
        if (amount <= 0) return;
        this.pointBalance = Math.max(0, this.pointBalance - amount);
        this.pointEarnedTotal = Math.max(0, this.pointEarnedTotal - amount);
        this.grade = Grade.calculateFrom(this.pointEarnedTotal);
    }

    /**
     * GradeResetScheduler(월초 크론)가 부른다. 등급 기준이 월 지출액에서
     * 누적 적립 포인트로 바뀌면서 「초기화」할 대상이 사라졌다 - 여기서
     * pointEarnedTotal 을 0 으로 만들면 매달 전 회원 등급이 날아간다.
     * 그래서 지금은 등급만 다시 계산한다. 스케줄러를 남길지는 팀 판단.
     */
    public void resetMonthlySpend() {
        this.grade = Grade.calculateFrom(this.pointEarnedTotal);
    }
}