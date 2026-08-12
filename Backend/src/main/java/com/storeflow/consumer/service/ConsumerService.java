package com.storeflow.consumer.service;

import com.storeflow.consumer.dto.LoginRequest;
import com.storeflow.consumer.dto.LoginResponse;
import com.storeflow.consumer.dto.SignupRequest;
import com.storeflow.consumer.entity.Consumer;
import com.storeflow.consumer.exception.InvalidCredentialsException;
import com.storeflow.consumer.repository.ConsumerRepository;
import com.storeflow.global.jwt.ConsumerJwtUtil;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ConsumerService {

    private final ConsumerRepository consumerRepository;
    private final PasswordEncoder passwordEncoder;
    private final ConsumerJwtUtil jwtUtil;

    public ConsumerService(ConsumerRepository consumerRepository,
                            PasswordEncoder passwordEncoder,
                            ConsumerJwtUtil jwtUtil) {
        this.consumerRepository = consumerRepository;
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

        consumerRepository.save(consumer);
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

        consumer.updateRefreshToken(null); // refreshToken 무효화
    }
}
