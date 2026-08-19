package com.storeflow.consumer.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public class ResetPasswordRequest {

    @NotBlank(message = "전화번호는 필수입니다.")
    @Pattern(regexp = "^01[0-9]{8,9}$", message = "전화번호 형식이 올바르지 않습니다.")
    private String phoneNumber;

    // SignupRequest와 동일한 정책: 영문 최소 1자 + 특수문자 최소 1자 포함, 8~20자
    @NotBlank(message = "비밀번호는 필수입니다.")
    @Pattern(
        regexp = "^(?=.*[A-Za-z])(?=.*[^A-Za-z0-9]).{8,20}$",
        message = "비밀번호는 영문과 특수문자를 포함해 8~20자여야 합니다."
    )
    private String newPassword;

    public String getPhoneNumber() { return phoneNumber; }
    public void setPhoneNumber(String phoneNumber) { this.phoneNumber = phoneNumber; }
    public String getNewPassword() { return newPassword; }
    public void setNewPassword(String newPassword) { this.newPassword = newPassword; }
}