package com.storeflow.consumer.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;

public class SignupRequest {

    // 01012345678 형식 (하이픈 없이 통일, 프론트에서 하이픈 제거 후 전송)
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
    private boolean cameraConsent;
    private boolean micConsent;
    private boolean marketingConsent;

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
}