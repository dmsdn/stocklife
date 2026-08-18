package com.storeflow.consumer.service;

import com.storeflow.consumer.dto.LoginRequest;
import com.storeflow.consumer.dto.LoginResponse;
import com.storeflow.consumer.dto.SignupRequest;
import com.storeflow.consumer.entity.Consumer;
import com.storeflow.consumer.entity.Member;
import com.storeflow.consumer.exception.InvalidCredentialsException;
import com.storeflow.consumer.repository.ConsumerRepository;
import com.storeflow.consumer.repository.MemberRepository;
import com.storeflow.global.jwt.ConsumerJwtUtil;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class ConsumerService {

    private final ConsumerRepository consumerRepository;
    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final ConsumerJwtUtil jwtUtil;

    public ConsumerService(ConsumerRepository consumerRepository,
                            MemberRepository memberRepository,
                            PasswordEncoder passwordEncoder,
                            ConsumerJwtUtil jwtUtil) {
        this.consumerRepository = consumerRepository;
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
    }

    @Transactional
    public void signup(SignupRequest request) {
        if (consumerRepository.existsByPhoneNumber(request.getPhoneNumber())) {
            throw new IllegalStateException("이미 가입된 전화번호입니다.");
        }

        String encodedPassword = passwordEncoder.encode(request.getPassword());

        Consumer consumer = new Consumer(
                request.getPhoneNumber(),
                encodedPassword,
                request.getGender(),
                request.getBirthDate(),
                request.isCameraConsent(),
                request.isPersonalInfoConsent(),
                request.isMicConsent()
        );

        consumerRepository.save(consumer); // IDENTITY라 save 직후 consumerId가 채워짐

        // member_id는 저장하지 않고 계산(Member.toMemberId). persona_type은 반드시 '실사용자'
        // 문자열 그대로 — Agent 쪽이 학습 데이터에서 이 값으로 필터링함.
        // household_size는 가입 폼에 없는 값이라 NULL — 나중에 마이페이지 등에서 채움.
        int memberId = Member.toMemberId(consumer.getConsumerId());
        memberRepository.save(new Member(memberId, "실사용자", null, Instant.now()));
    }

    @Transactional
    public LoginResponse login(LoginRequest request) {
        Consumer consumer = consumerRepository.findByPhoneNumber(request.getPhoneNumber())
                .orElseThrow(() -> new InvalidCredentialsException("전화번호 또는 비밀번호가 일치하지 않습니다."));

        if (!passwordEncoder.matches(request.getPassword(), consumer.getPassword())) {
            throw new InvalidCredentialsException("전화번호 또는 비밀번호가 일치하지 않습니다.");
        }

        String accessToken = jwtUtil.generateAccessToken(consumer.getConsumerId());
        String refreshToken = jwtUtil.generateRefreshToken(consumer.getConsumerId());

        consumer.updateRefreshToken(refreshToken);

        return new LoginResponse(accessToken, refreshToken);
    }

    @Transactional
    public void logout(Long consumerId) {
        Consumer consumer = consumerRepository.findById(consumerId)
                .orElseThrow(() -> new IllegalStateException("존재하지 않는 회원입니다."));

        consumer.updateRefreshToken(null);
    }
}