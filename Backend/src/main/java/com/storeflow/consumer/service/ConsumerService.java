package com.storeflow.consumer.service;

import com.storeflow.cart.service.CartService;
import com.storeflow.consumer.dto.LoginRequest;
import com.storeflow.consumer.dto.LoginResponse;
import com.storeflow.consumer.dto.SignupRequest;
import com.storeflow.consumer.entity.Consumer;
import com.storeflow.consumer.entity.Member;
import com.storeflow.consumer.exception.InvalidCredentialsException;
import com.storeflow.consumer.repository.ConsumerRepository;
import com.storeflow.consumer.repository.MemberRepository;
import com.storeflow.global.jwt.ConsumerJwtUtil;
import com.storeflow.inventory.repository.ConsumerEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class ConsumerService {

    private static final Logger log = LoggerFactory.getLogger(ConsumerService.class);

    private final ConsumerRepository consumerRepository;
    private final MemberRepository memberRepository;
    private final PasswordEncoder passwordEncoder;
    private final ConsumerJwtUtil jwtUtil;
    private final ConsumerEventRepository consumerEventRepository;
    private final CartService cartService;

    public ConsumerService(ConsumerRepository consumerRepository,
                           MemberRepository memberRepository,
                           PasswordEncoder passwordEncoder,
                           ConsumerJwtUtil jwtUtil,
                           ConsumerEventRepository consumerEventRepository,
                           CartService cartService) {
        this.consumerRepository = consumerRepository;
        this.memberRepository = memberRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil = jwtUtil;
        this.consumerEventRepository = consumerEventRepository;
        this.cartService = cartService;
    }

    @Transactional
    public void signup(SignupRequest request) {
        // 전화번호는 필수 항목이 아니므로, 값이 있을 때만 중복 체크한다.
        if (request.getPhoneNumber() != null && !request.getPhoneNumber().isBlank()
                && consumerRepository.existsByPhoneNumber(request.getPhoneNumber())) {
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
                request.isMicConsent(),
                request.isMarketingConsent()
        );

        consumerRepository.save(consumer); // IDENTITY라 save 직후 consumerId가 채워짐

        // member_id는 저장하지 않고 계산(Member.toMemberId).
        // 스키마 v2.5: persona_type 폐기 → household_size/has_pet/has_child/by_car.
        // 전부 선택 입력이라 안 받은 값은 그대로 null로 저장한다.
        // 주의: null을 임의로 0/1(=false)로 채우면 안 됨 — "안 물어봄"과 "아니오"는 다른 의미이고,
        // 잘못 채우면 Agent 쪽 추천이 조용히 틀어진다.
        Byte householdSize = request.getHouseholdSize() == null
                ? null
                : request.getHouseholdSize().byteValue();

        int memberId = Member.toMemberId(consumer.getConsumerId());
        memberRepository.save(new Member(
                memberId,
                householdSize,
                request.getHasPet(),
                request.getHasChild(),
                request.getByCar(),
                Instant.now()
        ));
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

        // 요구사항 29: 비회원 상태로 쌓인 데이터(행동 기록 + 장바구니)를 이 계정으로 승계한다.
        // 두 승계 모두 이 메서드의 @Transactional 하나 안에서 처리 — 한쪽만 성공하고 롤백되는
        // 상황이 생기지 않도록 같은 트랜잭션에 둔다.
        // member_id는 Member.toMemberId(consumerId)와 동일한 계산식으로 구해야 값이 일치한다.
        if (request.getSessionId() != null && !request.getSessionId().isBlank()) {
            Integer memberId = Member.toMemberId(consumer.getConsumerId());
            int claimedEvents = consumerEventRepository.claimGuestEvents(request.getSessionId(), memberId);
            if (claimedEvents > 0) {
                log.info("비회원 이벤트 {}건을 sessionId={} → memberId={} 로 승계했습니다.",
                        claimedEvents, request.getSessionId(), memberId);
            }

            // 요구사항: 비회원 → 회원 장바구니 승계. 동일 SKU는 수량 병합(claimGuestCart 내부 처리).
            cartService.claimGuestCart(request.getSessionId(), consumer.getConsumerId());
        }

        return new LoginResponse(accessToken, refreshToken);
    }

    @Transactional
    public void logout(Long consumerId) {
        Consumer consumer = consumerRepository.findById(consumerId)
                .orElseThrow(() -> new IllegalStateException("존재하지 않는 회원입니다."));

        consumer.updateRefreshToken(null);
    }
}