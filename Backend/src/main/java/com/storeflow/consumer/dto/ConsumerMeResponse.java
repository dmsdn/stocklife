package com.storeflow.consumer.dto;

import com.storeflow.consumer.entity.Consumer;
import com.storeflow.consumer.entity.Grade;
import com.storeflow.consumer.entity.Member;

import java.time.LocalDate;

/**
 * 마이페이지 "내 정보"용 응답. Consumer(계정) + Member(가구 속성)를 합쳐서 내려준다.
 * Member 행이 아직 없는 경우(구가입자 등) household/pet/child/car는 전부 null.
 */
public class ConsumerMeResponse {
    private Long consumerId;
    private String phoneNumber;
    private String name;
    private String gender;
    private LocalDate birthDate;
    private Integer householdSize;
    private Boolean hasPet;
    private Boolean hasChild;
    private Boolean byCar;
    private Grade grade;
    private int monthlySpendAmount;
    private int pointBalance;
    private boolean marketingConsent;
    private boolean cameraConsent;
    private boolean micConsent;

    public ConsumerMeResponse(Consumer consumer, Member member) {
        this.consumerId = consumer.getConsumerId();
        this.phoneNumber = consumer.getPhoneNumber();
        this.name = consumer.getName();
        this.gender = consumer.getGender();
        this.birthDate = consumer.getBirthDate();
        this.householdSize = member != null && member.getHouseholdSize() != null
                ? member.getHouseholdSize().intValue() : null;
        this.hasPet = member != null ? member.getHasPet() : null;
        this.hasChild = member != null ? member.getHasChild() : null;
        this.byCar = member != null ? member.getByCar() : null;
        this.grade = consumer.getGrade();
        this.monthlySpendAmount = consumer.getMonthlySpendAmount();
        this.pointBalance = consumer.getPointBalance();
        this.marketingConsent = consumer.isMarketingConsent();
        this.cameraConsent = consumer.isCameraConsent();
        this.micConsent = consumer.isMicConsent();
    }

    public Long getConsumerId() { return consumerId; }
    public String getPhoneNumber() { return phoneNumber; }
    public String getName() { return name; }
    public String getGender() { return gender; }
    public LocalDate getBirthDate() { return birthDate; }
    public Integer getHouseholdSize() { return householdSize; }
    public Boolean getHasPet() { return hasPet; }
    public Boolean getHasChild() { return hasChild; }
    public Boolean getByCar() { return byCar; }
    public Grade getGrade() { return grade; }
    public int getMonthlySpendAmount() { return monthlySpendAmount; }
    public int getPointBalance() { return pointBalance; }
    public boolean isMarketingConsent() { return marketingConsent; }
    public boolean isCameraConsent() { return cameraConsent; }
    public boolean isMicConsent() { return micConsent; }
}