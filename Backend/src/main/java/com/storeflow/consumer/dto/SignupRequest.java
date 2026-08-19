package com.storeflow.consumer.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;

public class SignupRequest {

    // 01012345678 형식 (하이픈 없이 통일, 프론트에서 하이픈 제거 후 전송)
    // 전화번호 필수로 변경(2026-08-19) — 가입 시 반드시 있어야 함.
    @NotBlank(message = "전화번호는 필수입니다.")
    @Pattern(regexp = "^01[0-9]{8,9}$", message = "전화번호 형식이 올바르지 않습니다.")
    private String phoneNumber;

    // 영문 최소 1자 + 숫자 최소 1자 + 특수문자 최소 1자 포함, 8~20자
    @NotBlank(message = "비밀번호는 필수입니다.")
    @Pattern(
            regexp = "^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,20}$",
            message = "비밀번호는 영문, 숫자, 특수문자를 모두 포함해 8~20자여야 합니다."
    )
    private String password;

    // 선택 입력
    private String gender;
    private LocalDate birthDate;

    // 필수 동의 — 서비스 이용에 반드시 필요한 항목만 남긴다.
    @AssertTrue(message = "개인정보 수집에 동의해야 합니다.")
    private boolean personalInfoConsent;

    // 선택 동의 — boolean 기본값(false)을 그대로 두면 "동의 안 함"으로 저장된다.
    // 카메라/마이크 동의는 선택 동의로 변경(2026-08-19) — @AssertTrue 제거.
    private boolean cameraConsent;
    private boolean micConsent;
    private boolean marketingConsent;

    // 스키마 v2.5 (2026-08-19) — persona_type(라벨 1개) 폐기, 속성 컬럼 4개로 분리.
    // 전부 선택 입력이며 안 받은 항목은 null 그대로 보낸다(0/1로 채우지 말 것 — NULL과 FALSE는 다른 의미).
    // household_size: 1~5 (5 = "5명 이상"), has_pet/has_child/by_car: 예/아니오
    @Min(value = 1, message = "가구원 수는 1 이상이어야 합니다.")
    @Max(value = 5, message = "가구원 수는 5 이하로 입력해주세요(5명 이상은 5).")
    private Integer householdSize;

    private Boolean hasPet;

    private Boolean hasChild;

    private Boolean byCar;

    // getter/setter
    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public String getGender() { return gender; }
    public void setGender(String gender) { this.gender = gender; }

    public LocalDate getBirthDate() { return birthDate; }
    public void setBirthDate(LocalDate birthDate) { this.birthDate = birthDate; }

    public boolean isCameraConsent() { return cameraConsent; }
    public void setCameraConsent(boolean cameraConsent) { this.cameraConsent = cameraConsent; }

    public boolean isPersonalInfoConsent() { return personalInfoConsent; }
    public void setPersonalInfoConsent(boolean personalInfoConsent) { this.personalInfoConsent = personalInfoConsent; }

    public boolean isMicConsent() { return micConsent; }
    public void setMicConsent(boolean micConsent) { this.micConsent = micConsent; }

    public boolean isMarketingConsent() { return marketingConsent; }
    public void setMarketingConsent(boolean marketingConsent) { this.marketingConsent = marketingConsent; }

    public Integer getHouseholdSize() { return householdSize; }
    public void setHouseholdSize(Integer householdSize) { this.householdSize = householdSize; }

    public Boolean getHasPet() { return hasPet; }
    public void setHasPet(Boolean hasPet) { this.hasPet = hasPet; }

    public Boolean getHasChild() { return hasChild; }
    public void setHasChild(Boolean hasChild) { this.hasChild = hasChild; }

    public Boolean getByCar() { return byCar; }
    public void setByCar(Boolean byCar) { this.byCar = byCar; }
}