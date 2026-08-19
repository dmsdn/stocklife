package com.storeflow.verification.repository;

import com.storeflow.verification.entity.PhoneVerification;
import com.storeflow.verification.entity.VerificationPurpose;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PhoneVerificationRepository extends JpaRepository<PhoneVerification, Long> {

    Optional<PhoneVerification> findTopByPhoneNumberAndPurposeOrderByCreatedAtDesc(
            String phoneNumber, VerificationPurpose purpose);

    // 새 인증번호 발송 시 같은 phoneNumber+purpose의 이전 레코드를 무효화(삭제)하기 위함
    void deleteByPhoneNumberAndPurpose(String phoneNumber, VerificationPurpose purpose);
}