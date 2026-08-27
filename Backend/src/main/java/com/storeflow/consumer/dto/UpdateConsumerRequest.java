package com.storeflow.consumer.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import java.time.LocalDate;

/**
 * 마이페이지 회원정보 수정 요청. 전부 선택 필드 — null로 온 필드는 값을 바꾸지 않는다.
 * (SignupRequest와 동일한 원칙: null=안 건드림, false=명시적으로 "아니오")
 */
public class UpdateConsumerRequest {

    private String gender;
    private LocalDate birthDate;

    @Min(value = 1, message = "가구원 수는 1 이상이어야 합니다.")
    @Max(value = 5, message = "가구원 수는 5 이하로 입력해주세요(5명 이상은 5).")
    private Integer householdSize;

    private Boolean hasPet;
    private Boolean hasChild;
    private Boolean byCar;
    private Boolean marketingConsent;

    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }

    public LocalDate getBirthDate() { return birthDate; }
    public void setBirthDate(LocalDate birthDate) { this.birthDate = birthDate; }

    public Integer getHouseholdSize() { return householdSize; }
    public void setHouseholdSize(Integer householdSize) { this.householdSize = householdSize; }

    public Boolean getHasPet() { return hasPet; }
    public void setHasPet(Boolean hasPet) { this.hasPet = hasPet; }

    public Boolean getHasChild() { return hasChild; }
    public void setHasChild(Boolean hasChild) { this.hasChild = hasChild; }

    public Boolean getByCar() { return byCar; }
    public void setByCar(Boolean byCar) { this.byCar = byCar; }

    public Boolean getMarketingConsent() { return marketingConsent; }
    public void setMarketingConsent(Boolean marketingConsent) { this.marketingConsent = marketingConsent; }
}