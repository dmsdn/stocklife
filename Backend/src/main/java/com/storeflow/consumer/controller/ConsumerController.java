package com.storeflow.consumer.controller;

import com.storeflow.consumer.dto.ConsumerMeResponse;
import com.storeflow.consumer.dto.LoginRequest;
import com.storeflow.consumer.dto.LoginResponse;
import com.storeflow.consumer.dto.ResetPasswordRequest;
import com.storeflow.consumer.dto.RegistrationCheckRequest;
import com.storeflow.consumer.dto.RegistrationStatusResponse;
import com.storeflow.consumer.dto.SignupRequest;
import com.storeflow.consumer.dto.UpdateConsumerRequest;
import com.storeflow.consumer.service.ConsumerService;
import com.storeflow.global.security.CurrentConsumer; // JWT에서 consumerId 꺼내는 커스텀 애노테이션 (아래 참고)
import com.storeflow.verification.dto.MessageResponse;
import com.storeflow.verification.dto.SendCodeRequest;
import com.storeflow.verification.dto.VerifyCodeRequest;
import com.storeflow.verification.entity.VerificationPurpose;
import com.storeflow.verification.service.PhoneVerificationService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/consumers")
public class ConsumerController {

    private final ConsumerService consumerService;
    private final PhoneVerificationService phoneVerificationService;

    public ConsumerController(ConsumerService consumerService, PhoneVerificationService phoneVerificationService) {
        this.consumerService = consumerService;
        this.phoneVerificationService = phoneVerificationService;
    }

    @PostMapping("/signup")
    public ResponseEntity<Void> signup(@Valid @RequestBody SignupRequest request) {
        consumerService.signup(request);
        return ResponseEntity.status(201).build();
    }

    // v2.5: persona_type 선택지 목록 API(/persona-types)는 폐기.
    // household_size(1~5)/has_pet/has_child/by_car는 고정된 선택지 목록이 필요 없어
    // 프론트가 하드코딩해도 되는 값이라 별도 조회 API를 두지 않는다.

    // ---------- 회원가입 전화번호 인증 ----------

    @PostMapping("/signup/send-code")
    public ResponseEntity<MessageResponse> sendSignupCode(@Valid @RequestBody SendCodeRequest request) {
        phoneVerificationService.sendCode(request.getPhoneNumber(), VerificationPurpose.SIGNUP);
        return ResponseEntity.ok(new MessageResponse("인증번호가 발송되었습니다."));
    }

    @PostMapping("/signup/verify-code")
    public ResponseEntity<MessageResponse> verifySignupCode(@Valid @RequestBody VerifyCodeRequest request) {
        phoneVerificationService.verifyCode(request.getPhoneNumber(), VerificationPurpose.SIGNUP, request.getCode());
        return ResponseEntity.ok(new MessageResponse("인증되었습니다."));
    }

    // ---------- 비밀번호 재설정 ----------

    @PostMapping("/password/reset/send-code")
    public ResponseEntity<MessageResponse> sendPasswordResetCode(@Valid @RequestBody SendCodeRequest request) {
        consumerService.assertMemberExistsByPhoneNumber(request.getPhoneNumber());
        phoneVerificationService.sendCode(request.getPhoneNumber(), VerificationPurpose.PASSWORD_RESET);
        return ResponseEntity.ok(new MessageResponse("인증번호가 발송되었습니다."));
    }

    @PostMapping("/password/reset/verify-code")
    public ResponseEntity<MessageResponse> verifyPasswordResetCode(@Valid @RequestBody VerifyCodeRequest request) {
        phoneVerificationService.verifyCode(request.getPhoneNumber(), VerificationPurpose.PASSWORD_RESET, request.getCode());
        return ResponseEntity.ok(new MessageResponse("인증되었습니다."));
    }

    @PostMapping("/password/reset")
    public ResponseEntity<MessageResponse> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        consumerService.resetPassword(request);
        return ResponseEntity.ok(new MessageResponse("비밀번호가 변경되었습니다."));
    }

    /**
     * 전화번호 기준 기존 회원 여부 확인.
     * registered=true  -> 로그인 화면
     * registered=false -> 회원가입 화면
     */
    @PostMapping("/registration-status")
    public ResponseEntity<RegistrationStatusResponse> registrationStatus(
            @Valid @RequestBody RegistrationCheckRequest request
    ) {
        return ResponseEntity.ok(consumerService.getRegistrationStatus(request.getPhoneNumber()));
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        LoginResponse response = consumerService.login(request);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CurrentConsumer Long consumerId) {
        consumerService.logout(consumerId);
        return ResponseEntity.noContent().build();
    }

    /** 마이페이지 "내 정보" 조회. */
    @GetMapping("/me")
    public ResponseEntity<ConsumerMeResponse> getMe(@CurrentConsumer Long consumerId) {
        return ResponseEntity.ok(consumerService.getMe(consumerId));
    }

    /** 마이페이지 회원정보 수정(성별/생년월일/가구원수/반려동물/자녀/차량/마케팅수신동의). */
    @PatchMapping("/me")
    public ResponseEntity<ConsumerMeResponse> updateMe(@CurrentConsumer Long consumerId,
                                                       @Valid @RequestBody UpdateConsumerRequest request) {
        return ResponseEntity.ok(consumerService.updateMe(consumerId, request));
    }

    /** 회원탈퇴. 성공하면 프론트는 토큰을 지우고 로그인 화면으로 보내면 된다. */
    @DeleteMapping("/me")
    public ResponseEntity<Void> withdraw(@CurrentConsumer Long consumerId) {
        consumerService.withdraw(consumerId);
        return ResponseEntity.noContent().build();
    }
}