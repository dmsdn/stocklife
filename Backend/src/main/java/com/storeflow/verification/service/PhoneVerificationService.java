package com.storeflow.verification.service;

import com.storeflow.verification.entity.PhoneVerification;
import com.storeflow.verification.entity.VerificationPurpose;
import com.storeflow.verification.exception.ResendTooSoonException;
import com.storeflow.verification.exception.VerificationCodeExpiredException;
import com.storeflow.verification.exception.VerificationCodeInvalidException;
import com.storeflow.verification.exception.VerificationNotCompletedException;
import com.storeflow.verification.repository.PhoneVerificationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

@Service
public class PhoneVerificationService {

    private static final Duration CODE_TTL = Duration.ofMinutes(3);
    private static final int MAX_ATTEMPTS = PhoneVerification.MAX_ATTEMPTS;

    // 스펙에 정확한 초 단위가 없어 임의로 정한 재발송 쿨다운. 필요하면 조정.
    private static final Duration RESEND_COOLDOWN = Duration.ofSeconds(60);

    private static final SecureRandom RANDOM = new SecureRandom();

    private final PhoneVerificationRepository phoneVerificationRepository;
    private final SmsSender smsSender;

    public PhoneVerificationService(PhoneVerificationRepository phoneVerificationRepository, SmsSender smsSender) {
        this.phoneVerificationRepository = phoneVerificationRepository;
        this.smsSender = smsSender;
    }

    @Transactional
    public void sendCode(String phoneNumber, VerificationPurpose purpose) {
        phoneVerificationRepository.findTopByPhoneNumberAndPurposeOrderByCreatedAtDesc(phoneNumber, purpose)
                .ifPresent(prev -> {
                    long secondsSinceSent = ChronoUnit.SECONDS.between(prev.getCreatedAt(), LocalDateTime.now());
                    if (secondsSinceSent < RESEND_COOLDOWN.getSeconds()) {
                        long retryAfter = RESEND_COOLDOWN.getSeconds() - secondsSinceSent;
                        throw new ResendTooSoonException(
                                "잠시 후 다시 시도해주세요. (" + retryAfter + "초 후 재발송 가능)", retryAfter);
                    }
                });

        // 새 인증번호 발송 시 이전 인증번호는 전부 무효화
        phoneVerificationRepository.deleteByPhoneNumberAndPurpose(phoneNumber, purpose);

        String code = generateCode();
        PhoneVerification verification = new PhoneVerification(
                phoneNumber, code, purpose, LocalDateTime.now().plus(CODE_TTL));
        phoneVerificationRepository.save(verification);

        smsSender.send(phoneNumber, buildMessage(code));
    }

    @Transactional
    public void verifyCode(String phoneNumber, VerificationPurpose purpose, String code) {
        PhoneVerification verification = phoneVerificationRepository
                .findTopByPhoneNumberAndPurposeOrderByCreatedAtDesc(phoneNumber, purpose)
                .orElseThrow(() -> new VerificationCodeExpiredException("발송된 인증번호가 없습니다. 인증번호를 먼저 요청해주세요."));

        if (verification.isDiscarded()) {
            throw new VerificationCodeExpiredException("인증 시도 횟수를 초과해 인증번호가 폐기되었습니다. 재발송해주세요.");
        }
        if (verification.isExpired()) {
            throw new VerificationCodeExpiredException("인증번호 유효시간이 만료되었습니다. 재발송해주세요.");
        }

        if (!verification.getVerificationCode().equals(code)) {
            verification.recordFailedAttempt();
            int remaining = MAX_ATTEMPTS - verification.getAttemptCount();
            if (remaining <= 0) {
                throw new VerificationCodeExpiredException("인증 시도 횟수를 초과해 인증번호가 폐기되었습니다. 재발송해주세요.");
            }
            throw new VerificationCodeInvalidException("인증번호가 일치하지 않습니다. (남은 시도 " + remaining + "회)");
        }

        verification.markVerified();
    }

    /**
     * 최종 가입/비밀번호 재설정 단계에서, 해당 phoneNumber+purpose가 실제로 인증을 마쳤는지 확인한다.
     * 통과하면 재사용 방지를 위해 레코드를 소비(삭제)한다.
     *
     * isExpired() 검사를 여기서 하지 않는 이유: 그 만료 시각(발송 시각 + 3분)은
     * "인증번호를 입력하는 그 단계"(verifyCode)에서만 의미가 있다. verifyCode에서 이미
     * 시간 안에 인증을 마쳤는지 확인이 끝났고 그 결과가 verified=true로 저장됐다면,
     * 그 뒤로 이어지는 가입 단계(비밀번호·이름·추가정보 입력)에 시간이 얼마나 걸리든
     * 인증 자체가 무효가 될 이유가 없다. 여기서 다시 검사하면 "인증번호 유효시간"이
     * 인증 단계가 아니라 회원가입 전체 과정에 적용되는 셈이 되어, 정상적으로 인증을
     * 마친 사용자가 뒷단계 입력이 조금만 늦어져도 최종 제출에서 튕겨난다.
     */
    @Transactional
    public void assertVerifiedAndConsume(String phoneNumber, VerificationPurpose purpose) {
        PhoneVerification verification = phoneVerificationRepository
                .findTopByPhoneNumberAndPurposeOrderByCreatedAtDesc(phoneNumber, purpose)
                .orElseThrow(() -> new VerificationNotCompletedException("휴대폰 인증이 필요합니다."));

        if (!verification.isVerified()) {
            throw new VerificationNotCompletedException("휴대폰 인증이 필요합니다.");
        }

        phoneVerificationRepository.delete(verification);
    }

    private String generateCode() {
        int value = RANDOM.nextInt(1_000_000);
        return String.format("%06d", value);
    }

    private String buildMessage(String code) {
        return "[StoreFlow] 인증번호는 " + code + " 입니다. 3분 이내에 입력해주세요.";
    }
}